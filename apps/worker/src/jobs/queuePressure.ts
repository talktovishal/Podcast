import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { workerEnv } from "../lib/env.js";
import { workerLogger } from "../lib/logger.js";
import { workerPrimaryStore, workerUsesAzureTablePrimary } from "../lib/metadata-primary-store.js";
import { loadMirrorQueuePressureSnapshot } from "../lib/metadata-projection.js";

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

async function loadPrismaQueuePressureSnapshot(nowTs: Date): Promise<QueuePressureSnapshot> {
  if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
    const [jobs, processing] = await Promise.all([
      workerPrimaryStore.listNextEligibleJobs(nowTs, workerEnv.maxRetryAttempts),
      workerPrimaryStore.listJobsByStatus("PROCESSING")
    ]);
    const queuedJobs = jobs.filter((job) => job.status === "QUEUED").length;
    const retryableFailedJobs = jobs.filter((job) => job.status === "FAILED").length;
    const processingJobs = processing.length;
    const oldestEligible = jobs
      .map((job) => job.createdAt)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    return {
      capturedAt: nowTs,
      queuedJobs,
      retryableFailedJobs,
      processingJobs,
      eligibleJobs: queuedJobs + retryableFailedJobs,
      oldestEligibleJobCreatedAt: oldestEligible,
      oldestEligibleJobAgeMs: oldestEligible ? Math.max(0, nowTs.getTime() - oldestEligible.getTime()) : 0
    };
  }

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

let lastCanaryLogAt = 0;
const CANARY_LOG_INTERVAL_MS = 60_000;

async function maybeLogCanaryDiffs(prismaSnapshot: QueuePressureSnapshot, mirrorSnapshot: QueuePressureSnapshot): Promise<void> {
  const differences = {
    queuedJobs: mirrorSnapshot.queuedJobs - prismaSnapshot.queuedJobs,
    retryableFailedJobs: mirrorSnapshot.retryableFailedJobs - prismaSnapshot.retryableFailedJobs,
    processingJobs: mirrorSnapshot.processingJobs - prismaSnapshot.processingJobs,
    eligibleJobs: mirrorSnapshot.eligibleJobs - prismaSnapshot.eligibleJobs,
    oldestEligibleJobAgeMs: mirrorSnapshot.oldestEligibleJobAgeMs - prismaSnapshot.oldestEligibleJobAgeMs
  };

  const hasDiff = Object.values(differences).some((value) => value !== 0);
  const nowMs = Date.now();
  if (!hasDiff || nowMs - lastCanaryLogAt < CANARY_LOG_INTERVAL_MS) {
    return;
  }

  await workerLogger.warn("Queue pressure canary diff detected between Prisma and metadata mirror", {
    differences,
    prisma: {
      queuedJobs: prismaSnapshot.queuedJobs,
      retryableFailedJobs: prismaSnapshot.retryableFailedJobs,
      processingJobs: prismaSnapshot.processingJobs,
      eligibleJobs: prismaSnapshot.eligibleJobs,
      oldestEligibleJobAgeMs: prismaSnapshot.oldestEligibleJobAgeMs
    },
    mirror: {
      queuedJobs: mirrorSnapshot.queuedJobs,
      retryableFailedJobs: mirrorSnapshot.retryableFailedJobs,
      processingJobs: mirrorSnapshot.processingJobs,
      eligibleJobs: mirrorSnapshot.eligibleJobs,
      oldestEligibleJobAgeMs: mirrorSnapshot.oldestEligibleJobAgeMs
    }
  });
  lastCanaryLogAt = nowMs;
}

export async function loadQueuePressureSnapshot(nowTs = new Date()): Promise<QueuePressureSnapshot> {
  const prismaSnapshot = await loadPrismaQueuePressureSnapshot(nowTs);
  const mirrorSnapshot = await loadMirrorQueuePressureSnapshot(nowTs);

  if (workerEnv.metadataCanaryCompare && mirrorSnapshot) {
    await maybeLogCanaryDiffs(prismaSnapshot, mirrorSnapshot);
  }

  if (workerEnv.queuePressureSource === "mirror" && mirrorSnapshot) {
    return {
      ...mirrorSnapshot,
      capturedAt: nowTs
    };
  }

  return prismaSnapshot;
}
