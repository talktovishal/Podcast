import { env } from "./env";
import { logger } from "./logger";
import { webMetadataMirror } from "./metadata-mirror";
import { prisma } from "./prisma";

function shouldDualWriteMirror(): boolean {
  return env.metadataMirrorDualWrite && webMetadataMirror.enabled;
}

export async function syncQueueProjectionFromEnqueue(input: {
  item: {
    id: string;
    userId: string;
    sourceType: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    errorCode: string | null;
    errorMessage: string | null;
  };
  job: {
    id: string;
    itemId: string;
    status: string;
    attempt: number;
    createdAt: Date;
    updatedAt: Date;
    lockedAt: Date | null;
    nextRetryAt: Date | null;
    errorCode: string | null;
    errorMessage: string | null;
  };
}): Promise<void> {
  if (!shouldDualWriteMirror()) {
    return;
  }

  try {
    await Promise.all([
      webMetadataMirror.upsertItemProjection({
        id: input.item.id,
        userId: input.item.userId,
        sourceType: input.item.sourceType,
        status: input.item.status,
        createdAt: input.item.createdAt,
        updatedAt: input.item.updatedAt,
        errorCode: input.item.errorCode,
        errorMessage: input.item.errorMessage
      }),
      webMetadataMirror.upsertJobProjection({
        id: input.job.id,
        itemId: input.job.itemId,
        status: input.job.status,
        attempt: input.job.attempt,
        createdAt: input.job.createdAt,
        updatedAt: input.job.updatedAt,
        lockedAt: input.job.lockedAt,
        nextRetryAt: input.job.nextRetryAt,
        errorCode: input.job.errorCode,
        errorMessage: input.job.errorMessage
      })
    ]);
  } catch (error) {
    await logger.warn("Queue projection mirror write failed during enqueue", {
      itemId: input.item.id,
      jobId: input.job.id,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    });
  }
}

export async function deleteQueueProjectionByItemId(itemId: string, jobIds?: string[]): Promise<void> {
  if (!shouldDualWriteMirror()) {
    return;
  }

  try {
    const resolvedJobIds =
      jobIds ??
      (
        await prisma.job.findMany({
          where: { itemId },
          select: { id: true }
        })
      ).map((job) => job.id);
    await Promise.all([
      webMetadataMirror.deleteItemProjection(itemId),
      ...resolvedJobIds.map((jobId) => webMetadataMirror.deleteJobProjection(jobId))
    ]);
  } catch (error) {
    await logger.warn("Queue projection mirror delete failed", {
      itemId,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    });
  }
}
