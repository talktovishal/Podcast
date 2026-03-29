import { AppError, errorCodes } from "@articlepod/core";
import { env } from "./env";
import { findPrimaryUserById } from "./metadata-primary-auth";
import { webPrimaryStore, webUsesAzureTablePrimary } from "./metadata-primary-store";
import { prisma } from "./prisma";

const SUMMARY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type SummaryUsageSnapshot = {
  hasPaidAccess: boolean;
  summaryLimitPer7Days: number | null;
  summariesUsedLast7Days: number;
  remainingSummariesLast7Days: number | null;
};

function nonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function summaryWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - SUMMARY_WINDOW_MS);
}

async function countSummariesUsedLast7Days(userId: string): Promise<number> {
  const createdAt = summaryWindowStart();

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const runs = await webPrimaryStore.listSummaryRunsByUser(userId, Math.max(env.proWeeklySummaryLimit + 1, 20));
    return runs.filter((run) => run.createdAt >= createdAt).length;
  }

  return prisma.summaryRun.count({
    where: {
      userId,
      createdAt: {
        gte: createdAt
      }
    }
  });
}

function limitMessage(snapshot: SummaryUsageSnapshot): string {
  const limit = snapshot.summaryLimitPer7Days ?? 0;
  if (limit <= 0) {
    return "Manual summaries are temporarily disabled for paid accounts in this environment.";
  }

  return `This Pro plan includes ${limit} manual summar${limit === 1 ? "y" : "ies"} per 7 days. This account has reached that limit for now.`;
}

export async function getSummaryUsageSnapshot(userId: string): Promise<SummaryUsageSnapshot> {
  const user = await findPrimaryUserById(userId);
  if (!user) {
    throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
  }

  if (!user.isPaid) {
    return {
      hasPaidAccess: false,
      summaryLimitPer7Days: null,
      summariesUsedLast7Days: 0,
      remainingSummariesLast7Days: null
    };
  }

  const summaryLimitPer7Days = nonNegativeInt(env.proWeeklySummaryLimit);
  const summariesUsedLast7Days = await countSummariesUsedLast7Days(userId);

  return {
    hasPaidAccess: true,
    summaryLimitPer7Days,
    summariesUsedLast7Days,
    remainingSummariesLast7Days: Math.max(0, summaryLimitPer7Days - summariesUsedLast7Days)
  };
}

export async function consumeSummaryRunAllowance(userId: string): Promise<SummaryUsageSnapshot> {
  const snapshot = await getSummaryUsageSnapshot(userId);
  if (!snapshot.hasPaidAccess) {
    return snapshot;
  }

  if ((snapshot.remainingSummariesLast7Days ?? 0) <= 0) {
    throw new AppError(errorCodes.USAGE_LIMIT_EXCEEDED, limitMessage(snapshot), 402);
  }

  return {
    ...snapshot,
    summariesUsedLast7Days: snapshot.summariesUsedLast7Days + 1,
    remainingSummariesLast7Days:
      snapshot.remainingSummariesLast7Days === null ? null : Math.max(0, snapshot.remainingSummariesLast7Days - 1)
  };
}
