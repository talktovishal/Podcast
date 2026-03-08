import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { workerEnv } from "../lib/env.js";

export type QueuePressureSnapshot = {
  capturedAt: Date;
  queuedJobs: number;
  retryableFailedJobs: number;
  processingJobs: number;
  eligibleJobs: number;
  oldestEligibleJobCreatedAt: Date | null;
  oldestEligibleJobAgeMs: number;
};

function retryableFailedWhere(nowTs: Date): Prisma.JobWhereInput {
  return {
    status: "FAILED",
    nextRetryAt: { lte: nowTs },
    attempt: { lt: workerEnv.maxRetryAttempts }
  };
}

export async function loadQueuePressureSnapshot(nowTs = new Date()): Promise<QueuePressureSnapshot> {
  const retryableWhere = retryableFailedWhere(nowTs);
  const eligibleWhere: Prisma.JobWhereInput = {
    OR: [{ status: "QUEUED" }, retryableWhere]
  };

  const [queuedJobs, retryableFailedJobs, processingJobs, oldestEligible] = await Promise.all([
    prisma.job.count({
      where: {
        status: "QUEUED"
      }
    }),
    prisma.job.count({
      where: retryableWhere
    }),
    prisma.job.count({
      where: {
        status: "PROCESSING"
      }
    }),
    prisma.job.findFirst({
      where: eligibleWhere,
      orderBy: [{ createdAt: "asc" }],
      select: { createdAt: true }
    })
  ]);

  const oldestEligibleJobCreatedAt = oldestEligible?.createdAt ?? null;
  const oldestEligibleJobAgeMs = oldestEligibleJobCreatedAt
    ? Math.max(0, nowTs.getTime() - oldestEligibleJobCreatedAt.getTime())
    : 0;

  return {
    capturedAt: nowTs,
    queuedJobs,
    retryableFailedJobs,
    processingJobs,
    eligibleJobs: queuedJobs + retryableFailedJobs,
    oldestEligibleJobCreatedAt,
    oldestEligibleJobAgeMs
  };
}
