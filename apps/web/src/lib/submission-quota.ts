import { AppError, errorCodes } from "@articlepod/core";
import type { ItemJobKind } from "@articlepod/core";
import type { Prisma } from "@prisma/client";
import { refreshBillingStateFromStripe } from "./billing";
import { env } from "./env";
import { findPrimaryUserById, updatePrimaryUser } from "./metadata-primary-auth";
import { webPrimaryStore } from "./metadata-primary-store";
import { maxPaidDailyPodcastLimit, maxPaidDailySummaryLimit, paidPlanConfigForAccess } from "./paid-plan-config";
import { prisma } from "./prisma";

type QuotaDbClient = Prisma.TransactionClient | typeof prisma;
const PAID_PODCAST_WINDOW_MS = 24 * 60 * 60 * 1000;
const PAID_DEFERRED_BACKLOG_MULTIPLIER = 2;

export const PAID_SUBMISSION_DEFERRED_CODE = "PRO_DAILY_LIMIT_DEFERRED";

const quotaUserSelect = {
  id: true,
  isPaid: true,
  billingPlanCode: true,
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
  dailySummaryLimit: number | null;
  summariesUsedLast24Hours: number;
  remainingDailySummaries: number | null;
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

type PaidCapacityKind = "podcast" | "summary";

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

function paidCapacityLabel(kind: PaidCapacityKind): string {
  return kind === "summary" ? "summary-mode item summaries" : "new podcast episodes";
}

function limitMessageForKind(snapshot: SubmissionQuotaSnapshot, kind: PaidCapacityKind): string {
  if (!snapshot.isPaid) {
    return limitMessage(snapshot);
  }

  const limit = kind === "summary" ? snapshot.dailySummaryLimit ?? 0 : snapshot.dailyPodcastLimit ?? 0;
  if (limit <= 0) {
    return `${paidCapacityLabel(kind)} are temporarily disabled for paid accounts in this environment.`;
  }

  if (
    kind === "podcast" &&
    (snapshot.remainingDailyPodcasts ?? 0) <= 0 &&
    snapshot.maxDeferredPodcasts !== null &&
    snapshot.queuedDeferredPodcasts >= snapshot.maxDeferredPodcasts
  ) {
    return `This Pro plan includes ${limit} ${paidCapacityLabel(kind)} per 24 hours plus ${snapshot.maxDeferredPodcasts} queued overflow spot${snapshot.maxDeferredPodcasts === 1 ? "" : "s"}. The queue is full for now. Please try again later.`;
  }

  return `This Pro plan includes ${limit} ${paidCapacityLabel(kind)} per 24 hours. This account has reached that limit for now.`;
}

export function buildSubmissionQuotaSnapshot(input: {
  isPaid: boolean;
  billingPlanCode?: string | null;
  submissionCount: number;
  extraSubmissionCredits: number;
  podcastsUsedLast24Hours?: number;
  summariesUsedLast24Hours?: number;
  queuedDeferredPodcasts?: number;
}): SubmissionQuotaSnapshot {
  const freeTrialSubmissionLimit = nonNegativeInt(env.freeTrialSubmissionLimit);
  const paidPlan = paidPlanConfigForAccess({
    isPaid: input.isPaid,
    billingPlanCode: input.billingPlanCode
  });
  const dailyPodcastLimit = paidPlan ? nonNegativeInt(paidPlan.dailyPodcastLimit) : null;
  const dailySummaryLimit = paidPlan ? nonNegativeInt(paidPlan.dailySummaryLimit) : null;
  const extraSubmissionCredits = nonNegativeInt(input.extraSubmissionCredits);
  const totalFreeSubmissionAllowance = freeTrialSubmissionLimit + extraSubmissionCredits;
  const submissionCount = nonNegativeInt(input.submissionCount);
  const podcastsUsedLast24Hours = input.isPaid ? nonNegativeInt(input.podcastsUsedLast24Hours ?? 0) : 0;
  const summariesUsedLast24Hours = input.isPaid ? nonNegativeInt(input.summariesUsedLast24Hours ?? 0) : 0;
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
    dailySummaryLimit,
    summariesUsedLast24Hours,
    remainingDailySummaries: input.isPaid && dailySummaryLimit !== null ? Math.max(0, dailySummaryLimit - summariesUsedLast24Hours) : null,
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

function capacityKindForJobKind(jobKind: ItemJobKind): PaidCapacityKind {
  return jobKind === "SUMMARY_ONLY" ? "summary" : "podcast";
}

function jobKindsForCapacityKind(kind: PaidCapacityKind): ItemJobKind[] {
  return kind === "summary" ? ["SUMMARY_ONLY"] : ["FULL_EPISODE", "REQUEST_TTS"];
}

async function getPaidSubmissionScheduleState(
  userId: string,
  now: Date,
  kind: PaidCapacityKind,
  tx?: QuotaDbClient
): Promise<PaidSubmissionScheduleState> {
  if (env.metadataPrimaryBackend === "azure_table") {
    const lookbackLimit = Math.max(maxPaidDailyPodcastLimit() * 6, maxPaidDailySummaryLimit() * 3, 120);
    if (kind === "summary") {
      const tasks = (await webPrimaryStore?.listArticleSummaryTasksByUser(userId, lookbackLimit)) ?? [];
      const entries = tasks.map((task) => {
        const scheduledFor = resolveSubmissionScheduledFor({
          status: task.status,
          scheduledFor: task.scheduledFor,
          nextRetryAt: task.nextRetryAt,
          itemCreatedAt: task.createdAt,
          now
        });
        return {
          scheduledFor,
          isDeferredQueue: task.status === "QUEUED" && scheduledFor.getTime() > now.getTime()
        } satisfies SubmissionScheduleEntry;
      });
      return buildPaidSubmissionScheduleState(entries, now);
    }

    const acceptedJobKinds = new Set(jobKindsForCapacityKind(kind));
    const jobs = (await webPrimaryStore?.listJobsByUser(userId, lookbackLimit)) ?? [];
    const items = (await webPrimaryStore?.listItemsByUser(userId, lookbackLimit)) ?? [];
    const itemCreatedAtById = new Map(items.map((item) => [item.id, item.createdAt]));
    const entries = jobs
      .filter((job) => acceptedJobKinds.has(job.jobKind as ItemJobKind))
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
  if (kind === "summary") {
    const tasks = await db.articleSummaryTask.findMany({
      where: {
        userId,
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
            createdAt: {
              gte: paidPodcastWindowStart(now)
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
        createdAt: true
      }
    });

    return buildPaidSubmissionScheduleState(
      tasks.map((task) => {
        const scheduledFor = resolveSubmissionScheduledFor({
          status: task.status,
          scheduledFor: task.scheduledFor,
          nextRetryAt: task.nextRetryAt,
          itemCreatedAt: task.createdAt,
          now
        });
        return {
          scheduledFor,
          isDeferredQueue: task.status === "QUEUED" && scheduledFor.getTime() > now.getTime()
        };
      }),
      now
    );
  }

  const acceptedJobKinds = new Set(jobKindsForCapacityKind(kind));
  const jobs = await db.job.findMany({
    where: {
      item: { userId },
      jobKind: {
        in: [...acceptedJobKinds]
      },
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
    const [podcastScheduleState, summaryScheduleState] = user.isPaid
      ? await Promise.all([
          getPaidSubmissionScheduleState(user.id, nowTs, "podcast"),
          getPaidSubmissionScheduleState(user.id, nowTs, "summary")
        ])
      : [null, null];
    return buildSubmissionQuotaSnapshot({
      ...user,
      podcastsUsedLast24Hours: podcastScheduleState?.usedLast24Hours ?? 0,
      summariesUsedLast24Hours: summaryScheduleState?.usedLast24Hours ?? 0,
      queuedDeferredPodcasts: podcastScheduleState?.deferredQueueCount ?? 0
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
  const [podcastScheduleState, summaryScheduleState] = user.isPaid
    ? await Promise.all([
        getPaidSubmissionScheduleState(user.id, nowTs, "podcast", db),
        getPaidSubmissionScheduleState(user.id, nowTs, "summary", db)
      ])
    : [null, null];

  return buildSubmissionQuotaSnapshot({
    ...user,
    podcastsUsedLast24Hours: podcastScheduleState?.usedLast24Hours ?? 0,
    summariesUsedLast24Hours: summaryScheduleState?.usedLast24Hours ?? 0,
    queuedDeferredPodcasts: podcastScheduleState?.deferredQueueCount ?? 0
  });
}

function throwQuotaLimitError(snapshot: SubmissionQuotaSnapshot): never {
  throw new AppError(errorCodes.USAGE_LIMIT_EXCEEDED, limitMessage(snapshot), 402);
}

function throwQuotaLimitErrorForKind(snapshot: SubmissionQuotaSnapshot, kind: PaidCapacityKind): never {
  throw new AppError(errorCodes.USAGE_LIMIT_EXCEEDED, limitMessageForKind(snapshot, kind), 402);
}

export async function consumeSubmissionCredit(input: {
  userId: string;
  jobKind?: ItemJobKind;
  tx?: Prisma.TransactionClient;
}): Promise<SubmissionCreditOutcome> {
  const nowTs = new Date();
  const jobKind = input.jobKind ?? "FULL_EPISODE";
  const capacityKind = capacityKindForJobKind(jobKind);
  await refreshBillingStateFromStripe(input.userId);
  if (env.metadataPrimaryBackend === "azure_table") {
    const user = await findPrimaryUserById(input.userId);
    if (!user) {
      throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
    }

    const [podcastScheduleState, summaryScheduleState] = user.isPaid
      ? await Promise.all([
          getPaidSubmissionScheduleState(user.id, nowTs, "podcast"),
          getPaidSubmissionScheduleState(user.id, nowTs, "summary")
        ])
      : [null, null];
    const scheduleState = capacityKind === "summary" ? summaryScheduleState : podcastScheduleState;
    const before = buildSubmissionQuotaSnapshot({
      ...user,
      podcastsUsedLast24Hours: podcastScheduleState?.usedLast24Hours ?? 0,
      summariesUsedLast24Hours: summaryScheduleState?.usedLast24Hours ?? 0,
      queuedDeferredPodcasts: podcastScheduleState?.deferredQueueCount ?? 0
    });
    if (before.isPaid) {
      const dailyLimit = capacityKind === "summary" ? before.dailySummaryLimit ?? 0 : before.dailyPodcastLimit ?? 0;
      const remaining = capacityKind === "summary" ? before.remainingDailySummaries ?? 0 : before.remainingDailyPodcasts ?? 0;
      if (dailyLimit <= 0) {
        throwQuotaLimitErrorForKind(before, capacityKind);
      }

      if (remaining > 0) {
        return {
          snapshot: {
            ...before,
            podcastsUsedLast24Hours:
              capacityKind === "podcast" ? before.podcastsUsedLast24Hours + 1 : before.podcastsUsedLast24Hours,
            remainingDailyPodcasts:
              capacityKind === "podcast" && before.remainingDailyPodcasts !== null
                ? Math.max(0, before.remainingDailyPodcasts - 1)
                : before.remainingDailyPodcasts,
            summariesUsedLast24Hours:
              capacityKind === "summary" ? before.summariesUsedLast24Hours + 1 : before.summariesUsedLast24Hours,
            remainingDailySummaries:
              capacityKind === "summary" && before.remainingDailySummaries !== null
                ? Math.max(0, before.remainingDailySummaries - 1)
                : before.remainingDailySummaries
          },
          queueMode: "IMMEDIATE",
          scheduledFor: nowTs,
          acceptedMessage: null
        };
      }

      if (capacityKind === "summary") {
        throwQuotaLimitErrorForKind(before, capacityKind);
      }

      if (before.maxDeferredPodcasts !== null && before.queuedDeferredPodcasts >= before.maxDeferredPodcasts) {
        throwQuotaLimitErrorForKind(before, capacityKind);
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
    const [podcastScheduleState, summaryScheduleState] = await Promise.all([
      getPaidSubmissionScheduleState(user.id, nowTs, "podcast", tx),
      getPaidSubmissionScheduleState(user.id, nowTs, "summary", tx)
    ]);
    const scheduleState = capacityKind === "summary" ? summaryScheduleState : podcastScheduleState;
    const paidSnapshot = buildSubmissionQuotaSnapshot({
      ...user,
      podcastsUsedLast24Hours: podcastScheduleState.usedLast24Hours,
      summariesUsedLast24Hours: summaryScheduleState.usedLast24Hours,
      queuedDeferredPodcasts: podcastScheduleState.deferredQueueCount
    });

    const dailyLimit = capacityKind === "summary" ? paidSnapshot.dailySummaryLimit ?? 0 : paidSnapshot.dailyPodcastLimit ?? 0;
    const remaining = capacityKind === "summary" ? paidSnapshot.remainingDailySummaries ?? 0 : paidSnapshot.remainingDailyPodcasts ?? 0;
    if (dailyLimit <= 0) {
      throwQuotaLimitErrorForKind(paidSnapshot, capacityKind);
    }

    if (remaining > 0) {
      return {
        snapshot: {
          ...paidSnapshot,
          podcastsUsedLast24Hours:
            capacityKind === "podcast" ? paidSnapshot.podcastsUsedLast24Hours + 1 : paidSnapshot.podcastsUsedLast24Hours,
          remainingDailyPodcasts:
            capacityKind === "podcast" && paidSnapshot.remainingDailyPodcasts !== null
              ? Math.max(0, paidSnapshot.remainingDailyPodcasts - 1)
              : paidSnapshot.remainingDailyPodcasts,
          summariesUsedLast24Hours:
            capacityKind === "summary" ? paidSnapshot.summariesUsedLast24Hours + 1 : paidSnapshot.summariesUsedLast24Hours,
          remainingDailySummaries:
            capacityKind === "summary" && paidSnapshot.remainingDailySummaries !== null
              ? Math.max(0, paidSnapshot.remainingDailySummaries - 1)
              : paidSnapshot.remainingDailySummaries
        },
        queueMode: "IMMEDIATE",
        scheduledFor: nowTs,
        acceptedMessage: null
      };
    }

    if (capacityKind === "summary") {
      throwQuotaLimitErrorForKind(paidSnapshot, capacityKind);
    }

    if (paidSnapshot.maxDeferredPodcasts !== null && paidSnapshot.queuedDeferredPodcasts >= paidSnapshot.maxDeferredPodcasts) {
      throwQuotaLimitErrorForKind(paidSnapshot, capacityKind);
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
