import { AppError, errorCodes } from "@articlepod/core";
import type { Prisma } from "@prisma/client";
import { env } from "./env";
import { findPrimaryUserById, updatePrimaryUser } from "./metadata-primary-auth";
import { prisma } from "./prisma";

type QuotaDbClient = Prisma.TransactionClient | typeof prisma;

const quotaUserSelect = {
  id: true,
  isPaid: true,
  submissionCount: true,
  extraSubmissionCredits: true
} satisfies Prisma.UserSelect;

export type SubmissionQuotaSnapshot = {
  isPaid: boolean;
  submissionCount: number;
  freeTrialSubmissionLimit: number;
  extraSubmissionCredits: number;
  totalFreeSubmissionAllowance: number;
  remainingFreeSubmissions: number | null;
};

function nonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function limitMessage(snapshot: SubmissionQuotaSnapshot): string {
  const allowance = snapshot.totalFreeSubmissionAllowance;
  if (allowance <= 0) {
    return "Free submissions are disabled for this account. Upgrade to a paid plan or ask an admin for extra quota.";
  }

  return `You have used all ${allowance} free submission ${allowance === 1 ? "try" : "tries"}. Upgrade to a paid plan or ask an admin for extra quota.`;
}

export function buildSubmissionQuotaSnapshot(input: {
  isPaid: boolean;
  submissionCount: number;
  extraSubmissionCredits: number;
}): SubmissionQuotaSnapshot {
  const freeTrialSubmissionLimit = nonNegativeInt(env.freeTrialSubmissionLimit);
  const extraSubmissionCredits = nonNegativeInt(input.extraSubmissionCredits);
  const totalFreeSubmissionAllowance = freeTrialSubmissionLimit + extraSubmissionCredits;
  const submissionCount = nonNegativeInt(input.submissionCount);

  return {
    isPaid: input.isPaid,
    submissionCount,
    freeTrialSubmissionLimit,
    extraSubmissionCredits,
    totalFreeSubmissionAllowance,
    remainingFreeSubmissions: input.isPaid ? null : Math.max(0, totalFreeSubmissionAllowance - submissionCount)
  };
}

export async function getSubmissionQuotaSnapshot(userId: string, tx?: QuotaDbClient): Promise<SubmissionQuotaSnapshot> {
  if (env.metadataPrimaryBackend === "azure_table") {
    const user = await findPrimaryUserById(userId);
    if (!user) {
      throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
    }
    return buildSubmissionQuotaSnapshot(user);
  }

  const db = tx ?? prisma;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: quotaUserSelect
  });

  if (!user) {
    throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
  }

  return buildSubmissionQuotaSnapshot(user);
}

function throwQuotaLimitError(snapshot: SubmissionQuotaSnapshot): never {
  throw new AppError(errorCodes.USAGE_LIMIT_EXCEEDED, limitMessage(snapshot), 402);
}

export async function consumeSubmissionCredit(input: {
  userId: string;
  tx?: Prisma.TransactionClient;
}): Promise<SubmissionQuotaSnapshot> {
  if (env.metadataPrimaryBackend === "azure_table") {
    const user = await findPrimaryUserById(input.userId);
    if (!user) {
      throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
    }

    const before = buildSubmissionQuotaSnapshot(user);
    if (before.isPaid) {
      return before;
    }

    if ((before.remainingFreeSubmissions ?? 0) <= 0) {
      throwQuotaLimitError(before);
    }

    const updated = await updatePrimaryUser(user.id, {
      submissionCount: before.submissionCount + 1
    });
    if (!updated) {
      throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
    }
    return {
      ...before,
      submissionCount: before.submissionCount + 1,
      remainingFreeSubmissions: Math.max(0, (before.remainingFreeSubmissions ?? 0) - 1)
    };
  }

  const tx = input.tx;
  if (!tx) {
    throw new AppError(errorCodes.INTERNAL_ERROR, "Missing quota transaction", 500);
  }

  const user = await tx.user.findUnique({
    where: { id: input.userId },
    select: quotaUserSelect
  });

  if (!user) {
    throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
  }

  const before = buildSubmissionQuotaSnapshot(user);
  if (before.isPaid) {
    return before;
  }

  if ((before.remainingFreeSubmissions ?? 0) <= 0) {
    throwQuotaLimitError(before);
  }

  const claimed = await tx.user.updateMany({
    where: {
      id: user.id,
      isPaid: false,
      submissionCount: {
        lt: before.totalFreeSubmissionAllowance
      }
    },
    data: {
      submissionCount: {
        increment: 1
      }
    }
  });

  if (claimed.count !== 1) {
    const latest = await tx.user.findUnique({
      where: { id: user.id },
      select: quotaUserSelect
    });

    if (!latest) {
      throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
    }

    throwQuotaLimitError(buildSubmissionQuotaSnapshot(latest));
  }

  return {
    ...before,
    submissionCount: before.submissionCount + 1,
    remainingFreeSubmissions: Math.max(0, (before.remainingFreeSubmissions ?? 0) - 1)
  };
}
