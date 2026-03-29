import { AppError, errorCodes } from "@articlepod/core";
import type { Prisma } from "@prisma/client";
import { env } from "./env";
import { findPrimaryUserById, updatePrimaryUser } from "./metadata-primary-auth";
import { webPrimaryStore } from "./metadata-primary-store";
import { prisma } from "./prisma";

type QuotaDbClient = Prisma.TransactionClient | typeof prisma;
const PAID_PODCAST_WINDOW_MS = 24 * 60 * 60 * 1000;

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
  dailyPodcastLimit: number | null;
  podcastsUsedLast24Hours: number;
  remainingDailyPodcasts: number | null;
};

function nonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function limitMessage(snapshot: SubmissionQuotaSnapshot): string {
  if (snapshot.isPaid) {
    const limit = snapshot.dailyPodcastLimit ?? 0;
    if (limit <= 0) {
      return "Podcast creation is temporarily disabled for paid accounts in this environment.";
    }

    return `This Pro plan includes ${limit} new podcast episode${limit === 1 ? "" : "s"} per 24 hours. This account has reached that limit for now.`;
  }

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
  podcastsUsedLast24Hours?: number;
}): SubmissionQuotaSnapshot {
  const freeTrialSubmissionLimit = nonNegativeInt(env.freeTrialSubmissionLimit);
  const dailyPodcastLimit = input.isPaid ? nonNegativeInt(env.proDailyPodcastLimit) : null;
  const extraSubmissionCredits = nonNegativeInt(input.extraSubmissionCredits);
  const totalFreeSubmissionAllowance = freeTrialSubmissionLimit + extraSubmissionCredits;
  const submissionCount = nonNegativeInt(input.submissionCount);
  const podcastsUsedLast24Hours = input.isPaid ? nonNegativeInt(input.podcastsUsedLast24Hours ?? 0) : 0;

  return {
    isPaid: input.isPaid,
    submissionCount,
    freeTrialSubmissionLimit,
    extraSubmissionCredits,
    totalFreeSubmissionAllowance,
    remainingFreeSubmissions: input.isPaid ? null : Math.max(0, totalFreeSubmissionAllowance - submissionCount),
    dailyPodcastLimit,
    podcastsUsedLast24Hours,
    remainingDailyPodcasts: input.isPaid && dailyPodcastLimit !== null ? Math.max(0, dailyPodcastLimit - podcastsUsedLast24Hours) : null
  };
}

function paidPodcastWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - PAID_PODCAST_WINDOW_MS);
}

async function countPodcastsUsedLast24Hours(userId: string, tx?: QuotaDbClient): Promise<number> {
  const createdAt = {
    gte: paidPodcastWindowStart()
  };

  if (env.metadataPrimaryBackend === "azure_table") {
    const items = (await webPrimaryStore?.listItemsByUser(userId, Math.max(env.proDailyPodcastLimit + 1, 50))) ?? [];
    return items.filter((item) => item.createdAt >= createdAt.gte).length;
  }

  const db = tx ?? prisma;
  return db.item.count({
    where: {
      userId,
      createdAt
    }
  });
}

export async function getSubmissionQuotaSnapshot(userId: string, tx?: QuotaDbClient): Promise<SubmissionQuotaSnapshot> {
  if (env.metadataPrimaryBackend === "azure_table") {
    const user = await findPrimaryUserById(userId);
    if (!user) {
      throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
    }
    return buildSubmissionQuotaSnapshot({
      ...user,
      podcastsUsedLast24Hours: user.isPaid ? await countPodcastsUsedLast24Hours(user.id) : 0
    });
  }

  const db = tx ?? prisma;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: quotaUserSelect
  });

  if (!user) {
    throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
  }

  return buildSubmissionQuotaSnapshot({
    ...user,
    podcastsUsedLast24Hours: user.isPaid ? await countPodcastsUsedLast24Hours(user.id, db) : 0
  });
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

    const before = buildSubmissionQuotaSnapshot({
      ...user,
      podcastsUsedLast24Hours: user.isPaid ? await countPodcastsUsedLast24Hours(user.id) : 0
    });
    if (before.isPaid) {
      if ((before.remainingDailyPodcasts ?? 0) <= 0) {
        throwQuotaLimitError(before);
      }

      return {
        ...before,
        podcastsUsedLast24Hours: before.podcastsUsedLast24Hours + 1,
        remainingDailyPodcasts:
          before.remainingDailyPodcasts === null ? null : Math.max(0, before.remainingDailyPodcasts - 1)
      };
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
    const podcastsUsedLast24Hours = await countPodcastsUsedLast24Hours(user.id, tx);
    const paidSnapshot = buildSubmissionQuotaSnapshot({
      ...user,
      podcastsUsedLast24Hours
    });

    if ((paidSnapshot.remainingDailyPodcasts ?? 0) <= 0) {
      throwQuotaLimitError(paidSnapshot);
    }

    return {
      ...paidSnapshot,
      podcastsUsedLast24Hours: paidSnapshot.podcastsUsedLast24Hours + 1,
      remainingDailyPodcasts:
        paidSnapshot.remainingDailyPodcasts === null ? null : Math.max(0, paidSnapshot.remainingDailyPodcasts - 1)
    };
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
