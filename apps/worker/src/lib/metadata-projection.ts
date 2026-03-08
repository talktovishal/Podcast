import { workerEnv } from "./env.js";
import { workerLogger } from "./logger.js";
import { workerMetadataMirror } from "./metadata-mirror.js";
import { prisma } from "./prisma.js";

function shouldDualWriteMirror(): boolean {
  return workerEnv.metadataMirrorDualWrite && workerMetadataMirror.enabled;
}

function serializeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export async function syncItemProjectionById(itemId: string): Promise<void> {
  if (!shouldDualWriteMirror()) {
    return;
  }

  try {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        userId: true,
        sourceType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        errorCode: true,
        errorMessage: true
      }
    });
    if (!item) {
      await workerMetadataMirror.deleteItemProjection(itemId);
      return;
    }
    await workerMetadataMirror.upsertItemProjection(item);
  } catch (error) {
    await workerLogger.warn("Queue projection mirror item sync failed", {
      itemId,
      error: serializeError(error)
    });
  }
}

export async function syncJobProjectionById(jobId: string): Promise<void> {
  if (!shouldDualWriteMirror()) {
    return;
  }

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        itemId: true,
        status: true,
        attempt: true,
        createdAt: true,
        updatedAt: true,
        lockedAt: true,
        nextRetryAt: true,
        errorCode: true,
        errorMessage: true
      }
    });
    if (!job) {
      await workerMetadataMirror.deleteJobProjection(jobId);
      return;
    }
    await workerMetadataMirror.upsertJobProjection(job);
  } catch (error) {
    await workerLogger.warn("Queue projection mirror job sync failed", {
      jobId,
      error: serializeError(error)
    });
  }
}

export async function syncJobAndItemProjectionByJobId(jobId: string): Promise<void> {
  if (!shouldDualWriteMirror()) {
    return;
  }

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        itemId: true,
        status: true,
        attempt: true,
        createdAt: true,
        updatedAt: true,
        lockedAt: true,
        nextRetryAt: true,
        errorCode: true,
        errorMessage: true,
        item: {
          select: {
            id: true,
            userId: true,
            sourceType: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            errorCode: true,
            errorMessage: true
          }
        }
      }
    });

    if (!job) {
      await workerMetadataMirror.deleteJobProjection(jobId);
      return;
    }

    await Promise.all([
      workerMetadataMirror.upsertJobProjection({
        id: job.id,
        itemId: job.itemId,
        status: job.status,
        attempt: job.attempt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        lockedAt: job.lockedAt,
        nextRetryAt: job.nextRetryAt,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage
      }),
      workerMetadataMirror.upsertItemProjection({
        id: job.item.id,
        userId: job.item.userId,
        sourceType: job.item.sourceType,
        status: job.item.status,
        createdAt: job.item.createdAt,
        updatedAt: job.item.updatedAt,
        errorCode: job.item.errorCode,
        errorMessage: job.item.errorMessage
      })
    ]);
  } catch (error) {
    await workerLogger.warn("Queue projection mirror sync failed", {
      jobId,
      error: serializeError(error)
    });
  }
}

export async function syncDigestRunProjectionById(digestRunId: string): Promise<void> {
  if (!shouldDualWriteMirror()) {
    return;
  }

  try {
    const run = await prisma.digestRun.findUnique({
      where: { id: digestRunId },
      select: {
        id: true,
        userId: true,
        cadence: true,
        periodKey: true,
        status: true,
        attempt: true,
        createdAt: true,
        updatedAt: true,
        scheduledFor: true,
        lockedAt: true,
        nextRetryAt: true,
        errorCode: true,
        errorMessage: true
      }
    });
    if (!run) {
      await workerMetadataMirror.deleteDigestRunProjection(digestRunId);
      return;
    }
    await workerMetadataMirror.upsertDigestRunProjection(run);
  } catch (error) {
    await workerLogger.warn("Queue projection mirror digest-run sync failed", {
      digestRunId,
      error: serializeError(error)
    });
  }
}

export async function loadMirrorQueuePressureSnapshot(nowTs: Date) {
  if (!workerMetadataMirror.enabled) {
    return null;
  }

  return workerMetadataMirror.getQueuePressureSnapshot({
    now: nowTs,
    maxRetryAttempts: workerEnv.maxRetryAttempts
  });
}
