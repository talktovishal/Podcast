import { AppError, errorCodes } from "@articlepod/core";
import type { Prisma } from "@prisma/client";
import { refreshBillingStateFromStripe } from "./billing";
import { env } from "./env";
import { findPrimaryUserById, updatePrimaryUser } from "./metadata-primary-auth";
import { webPrimaryStore } from "./metadata-primary-store";
import { prisma } from "./prisma";

type QuotaDbClient = Prisma.TransactionClient | typeof prisma;
const PAID_PODCAST_WINDOW_MS = 24 * 60 * 60 * 1000;
const PAID_DEFERRED_BACKLOG_MULTIPLIER = 2;

export const PAID_SUBMISSION_DEFERRED_CODE = "PRO_DAILY_LIMIT_DEFERRED";

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
  queuedDeferredPodcasts: number;
  maxDeferredPodcasts: number | null;
};

export type SubmissionCreditOutcome = {
  snapshot: SubmissionQuotaSnapshot;
  queueMode: "IMMEDIATE" | "DEFERRED";
  scheduledFor: Date;
  acceptedMessage: string | null;
};

type SubmissionScheduleEntry = {
  scheduledFor: Date;
  isDeferredQueue: boolean;
};

type PaidSubmissionScheduleState = {
  usedLast24Hours: number;
  deferredQueueCount: number;
  scheduledSlots: Date[];
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

    if (
      (snapshot.remainingDailyPodcasts ?? 0) <= 0 &&
      snapshot.maxDeferredPodcasts !== null &&
      snapshot.queuedDeferredPodcasts >= snapshot.maxDeferredPodcasts
    ) {
      return `This Pro plan includes ${limit} new podcast episode${limit === 1 ? "" : "s"} per 24 hours plus ${snapshot.maxDeferredPodcasts} queued overflow spot${snapshot.maxDeferredPodcasts === 1 ? "" : "s"}. The queue is full for now. Please try again later.`;
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
  queuedDeferredPodcasts?: number;
}): SubmissionQuotaSnapshot {
  const freeTrialSubmissionLimit = nonNegativeInt(env.freeTrialSubmissionLimit);
  const dailyPodcastLimit = input.isPaid ? nonNegativeInt(env.proDailyPodcastLimit) : null;
  const extraSubmissionCredits = nonNegativeInt(input.extraSubmissionCredits);
  const totalFreeSubmissionAllowance = freeTrialSubmissionLimit + extraSubmissionCredits;
  const submissionCount = nonNegativeInt(input.submissionCount);
  const podcastsUsedLast24Hours = input.isPaid ? nonNegativeInt(input.podcastsUsedLast24Hours ?? 0) : 0;
  const queuedDeferredPodcasts = input.isPaid ? nonNegativeInt(input.queuedDeferredPodcasts ?? 0) : 0;
  const maxDeferredPodcasts = input.isPaid && dailyPodcastLimit !== null ? dailyPodcastLimit * PAID_DEFERRED_BACKLOG_MULTIPLIER : null;

  return {
    isPaid: input.isPaid,
    submissionCount,
    freeTrialSubmissionLimit,
    extraSubmissionCredits,
    totalFreeSubmissionAllowance,
    remainingFreeSubmissions: input.isPaid ? null : Math.max(0, totalFreeSubmissionAllowance - submissionCount),
    dailyPodcastLimit,
    podcastsUsedLast24Hours,
    remainingDailyPodcasts: input.isPaid && dailyPodcastLimit !== null ? Math.max(0, dailyPodcastLimit - podcastsUsedLast24Hours) : null,
    queuedDeferredPodcasts,
    maxDeferredPodcasts
  };
}

function paidPodcastWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - PAID_PODCAST_WINDOW_MS);
}

function resolveSubmissionScheduledFor(input: {
  status: string;
  scheduledFor: Date | null;
  nextRetryAt: Date | null;
  itemCreatedAt: Date | null;
  now: Date;
}): Date {
  if (input.scheduledFor) {
    return input.scheduledFor;
  }

  if (input.status === "QUEUED" && input.nextRetryAt && input.nextRetryAt.getTime() > input.now.getTime()) {
    return input.nextRetryAt;
  }

  return input.itemCreatedAt ?? input.now;
}

function buildPaidSubmissionScheduleState(entries: SubmissionScheduleEntry[], now: Date): PaidSubmissionScheduleState {
  const windowStartMs = paidPodcastWindowStart(now).getTime();
  const nowMs = now.getTime();
  const scheduledSlots = entries
    .map((entry) => entry.scheduledFor)
    .filter((scheduledFor) => scheduledFor.getTime() >= windowStartMs)
    .sort((left, right) => left.getTime() - right.getTime());

  return {
    usedLast24Hours: scheduledSlots.filter((scheduledFor) => scheduledFor.getTime() <= nowMs).length,
    deferredQueueCount: entries.filter((entry) => entry.isDeferredQueue).length,
    scheduledSlots
  };
}

async function getPaidSubmissionScheduleState(userId: string, now: Date, tx?: QuotaDbClient): Promise<PaidSubmissionScheduleState> {
  if (env.metadataPrimaryBackend === "azure_table") {
    const jobs = (await webPrimaryStore?.listJobsByUser(userId, Math.max(env.proDailyPodcastLimit * 6, 120))) ?? [];
    const items = (await webPrimaryStore?.listItemsByUser(userId, Math.max(env.proDailyPodcastLimit * 6, 120))) ?? [];
    const itemCreatedAtById = new Map(items.map((item) => [item.id, item.createdAt]));
    const entries = jobs
      .map((job) => {
        const itemCreatedAt = itemCreatedAtById.get(job.itemId);
        const scheduledFor = resolveSubmissionScheduledFor({
          status: job.status,
          scheduledFor: job.scheduledFor,
          nextRetryAt: job.nextRetryAt,
          itemCreatedAt: itemCreatedAt ?? null,
          now
        });
        return {
          scheduledFor,
          isDeferredQueue: job.status === "QUEUED" && scheduledFor.getTime() > now.getTime()
        } satisfies SubmissionScheduleEntry;
      })
      .filter((entry): entry is SubmissionScheduleEntry => entry !== null);

    return buildPaidSubmissionScheduleState(entries, now);
  }

  const db = tx ?? prisma;
  const jobs = await db.job.findMany({
    where: {
      item: { userId },
      OR: [
        {
          scheduledFor: {
            gte: paidPodcastWindowStart(now)
          }
        },
        {
          status: "QUEUED",
          scheduledFor: {
            gt: now
          }
        },
        {
          scheduledFor: null,
          item: {
            createdAt: {
              gte: paidPodcastWindowStart(now)
            }
          }
        },
        {
          status: "QUEUED",
          scheduledFor: null,
          nextRetryAt: {
            gt: now
          }
        }
      ]
    },
    select: {
      status: true,
      scheduledFor: true,
      nextRetryAt: true,
      item: {
        select: {
          createdAt: true
        }
      }
    }
  });

  return buildPaidSubmissionScheduleState(
    jobs.map((job) => {
      const scheduledFor = resolveSubmissionScheduledFor({
        status: job.status,
        scheduledFor: job.scheduledFor,
        nextRetryAt: job.nextRetryAt,
        itemCreatedAt: job.item.createdAt,
        now
      });
      return {
        scheduledFor,
        isDeferredQueue: job.status === "QUEUED" && scheduledFor.getTime() > now.getTime()
      };
    }),
    now
  );
}

function nextSubmissionSlot(existingSlots: Date[], dailyLimit: number, now: Date): Date {
  if (dailyLimit <= 0) {
    return now;
  }

  let candidate = now;
  const sortedSlots = [...existingSlots].sort((left, right) => left.getTime() - right.getTime());

  for (let guard = 0; guard < 1000; guard += 1) {
    const candidateMs = candidate.getTime();
    const windowStartMs = candidateMs - PAID_PODCAST_WINDOW_MS;
    const overlapping = sortedSlots.filter((slot) => {
      const time = slot.getTime();
      return time >= windowStartMs && time <= candidateMs;
    });

    if (overlapping.length < dailyLimit) {
      return candidate;
    }

    candidate = new Date(overlapping[0].getTime() + PAID_PODCAST_WINDOW_MS + 1);
  }

  return new Date(now.getTime() + PAID_PODCAST_WINDOW_MS);
}

export function buildDeferredSubmissionMessage(scheduledFor: Date): string {
  void scheduledFor;
  return "Accepted. Processing is queued for the next available Pro window and will start automatically when capacity opens.";
}

export async function getSubmissionQuotaSnapshot(userId: string, tx?: QuotaDbClient): Promise<SubmissionQuotaSnapshot> {
  const nowTs = new Date();
  await refreshBillingStateFromStripe(userId);
  if (env.metadataPrimaryBackend === "azure_table") {
    const user = await findPrimaryUserById(userId);
    if (!user) {
      throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
    }
    const scheduleState = user.isPaid ? await getPaidSubmissionScheduleState(user.id, nowTs) : null;
    return buildSubmissionQuotaSnapshot({
      ...user,
      podcastsUsedLast24Hours: scheduleState?.usedLast24Hours ?? 0,
      queuedDeferredPodcasts: scheduleState?.deferredQueueCount ?? 0
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
  const scheduleState = user.isPaid ? await getPaidSubmissionScheduleState(user.id, nowTs, db) : null;

  return buildSubmissionQuotaSnapshot({
    ...user,
    podcastsUsedLast24Hours: scheduleState?.usedLast24Hours ?? 0,
    queuedDeferredPodcasts: scheduleState?.deferredQueueCount ?? 0
  });
}

function throwQuotaLimitError(snapshot: SubmissionQuotaSnapshot): never {
  throw new AppError(errorCodes.USAGE_LIMIT_EXCEEDED, limitMessage(snapshot), 402);
}

export async function consumeSubmissionCredit(input: {
  userId: string;
  tx?: Prisma.TransactionClient;
}): Promise<SubmissionCreditOutcome> {
  const nowTs = new Date();
  await refreshBillingStateFromStripe(input.userId);
  if (env.metadataPrimaryBackend === "azure_table") {
    const user = await findPrimaryUserById(input.userId);
    if (!user) {
      throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
    }

    const scheduleState = user.isPaid ? await getPaidSubmissionScheduleState(user.id, nowTs) : null;
    const before = buildSubmissionQuotaSnapshot({
      ...user,
      podcastsUsedLast24Hours: scheduleState?.usedLast24Hours ?? 0,
      queuedDeferredPodcasts: scheduleState?.deferredQueueCount ?? 0
    });
    if (before.isPaid) {
      const dailyLimit = before.dailyPodcastLimit ?? 0;
      if (dailyLimit <= 0) {
        throwQuotaLimitError(before);
      }

      if ((before.remainingDailyPodcasts ?? 0) > 0) {
        return {
          snapshot: {
            ...before,
            podcastsUsedLast24Hours: before.podcastsUsedLast24Hours + 1,
            remainingDailyPodcasts:
              before.remainingDailyPodcasts === null ? null : Math.max(0, before.remainingDailyPodcasts - 1)
          },
          queueMode: "IMMEDIATE",
          scheduledFor: nowTs,
          acceptedMessage: null
        };
      }

      if (before.maxDeferredPodcasts !== null && before.queuedDeferredPodcasts >= before.maxDeferredPodcasts) {
        throwQuotaLimitError(before);
      }

      const scheduledFor = nextSubmissionSlot(scheduleState?.scheduledSlots ?? [], dailyLimit, nowTs);
      return {
        snapshot: {
          ...before,
          queuedDeferredPodcasts: before.queuedDeferredPodcasts + 1
        },
        queueMode: "DEFERRED",
        scheduledFor,
        acceptedMessage: buildDeferredSubmissionMessage(scheduledFor)
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
      snapshot: {
        ...before,
        submissionCount: before.submissionCount + 1,
        remainingFreeSubmissions: Math.max(0, (before.remainingFreeSubmissions ?? 0) - 1)
      },
      queueMode: "IMMEDIATE",
      scheduledFor: nowTs,
      acceptedMessage: null
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
    const scheduleState = await getPaidSubmissionScheduleState(user.id, nowTs, tx);
    const paidSnapshot = buildSubmissionQuotaSnapshot({
      ...user,
      podcastsUsedLast24Hours: scheduleState.usedLast24Hours,
      queuedDeferredPodcasts: scheduleState.deferredQueueCount
    });

    const dailyLimit = paidSnapshot.dailyPodcastLimit ?? 0;
    if (dailyLimit <= 0) {
      throwQuotaLimitError(paidSnapshot);
    }

    if ((paidSnapshot.remainingDailyPodcasts ?? 0) > 0) {
      return {
        snapshot: {
          ...paidSnapshot,
          podcastsUsedLast24Hours: paidSnapshot.podcastsUsedLast24Hours + 1,
          remainingDailyPodcasts:
            paidSnapshot.remainingDailyPodcasts === null ? null : Math.max(0, paidSnapshot.remainingDailyPodcasts - 1)
        },
        queueMode: "IMMEDIATE",
        scheduledFor: nowTs,
        acceptedMessage: null
      };
    }

    if (paidSnapshot.maxDeferredPodcasts !== null && paidSnapshot.queuedDeferredPodcasts >= paidSnapshot.maxDeferredPodcasts) {
      throwQuotaLimitError(paidSnapshot);
    }

    const scheduledFor = nextSubmissionSlot(scheduleState.scheduledSlots, dailyLimit, nowTs);
    return {
      snapshot: {
        ...paidSnapshot,
        queuedDeferredPodcasts: paidSnapshot.queuedDeferredPodcasts + 1
      },
      queueMode: "DEFERRED",
      scheduledFor,
      acceptedMessage: buildDeferredSubmissionMessage(scheduledFor)
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
    snapshot: {
      ...before,
      submissionCount: before.submissionCount + 1,
      remainingFreeSubmissions: Math.max(0, (before.remainingFreeSubmissions ?? 0) - 1)
    },
    queueMode: "IMMEDIATE",
    scheduledFor: nowTs,
    acceptedMessage: null
  };
}
