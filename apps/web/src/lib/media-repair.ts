import { randomUUID } from "node:crypto";
import type { Item } from "@prisma/client";
import { webPrimaryStore, webUsesAzureTablePrimary } from "./metadata-primary-store";
import { prisma } from "./prisma";
import { getArtifactStorage } from "./storage";

type ResolvedEpisodeMedia = {
  audioPath: string;
  audioBytes: number;
  mimeType: string;
};

type EnqueueEpisodeMediaRepairResult = {
  enqueued: boolean;
  itemId?: string;
  resolvedEpisode?: ResolvedEpisodeMedia;
  skippedReason?: "missing_episode_id" | "episode_not_found" | "audio_path_mismatch" | "not_repairable" | "active_job" | "processing";
};

function inferMimeType(path: string, fallback?: string | null): string {
  if (fallback) {
    return fallback;
  }
  if (path.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (path.endsWith(".m4a")) {
    return "audio/mp4";
  }
  return "application/octet-stream";
}

function deriveAlternateAudioPath(path: string): string | null {
  if (path.endsWith(".mp3")) {
    return `${path.slice(0, -4)}.m4a`;
  }
  if (path.endsWith(".m4a")) {
    return `${path.slice(0, -4)}.mp3`;
  }
  return null;
}

function canRegenerateMedia(item: Pick<Item, "sourceType" | "sourceUrl" | "sourceFilePath" | "sourceHtml">): boolean {
  if (item.sourceType === "URL") {
    return Boolean(item.sourceUrl);
  }
  if (item.sourceType === "HTML_SNAPSHOT") {
    return Boolean(item.sourceHtml) || Boolean(item.sourceFilePath);
  }
  if (item.sourceType === "PDF") {
    return Boolean(item.sourceFilePath);
  }
  return false;
}

export async function enqueueEpisodeMediaRepair(input: {
  episodeId: string | null | undefined;
  userId?: string | null;
  expectedAudioPath?: string | null;
  reason?: string;
}): Promise<EnqueueEpisodeMediaRepairResult> {
  const episodeId = input.episodeId || "";
  if (!episodeId) {
    return { enqueued: false, skippedReason: "missing_episode_id" };
  }

  const episode =
    webUsesAzureTablePrimary() && webPrimaryStore
      ? await (async () => {
          const episodeRow = await webPrimaryStore.findEpisodeById(episodeId);
          if (!episodeRow) {
            return null;
          }
          const itemRow = await webPrimaryStore.findItemById(episodeRow.itemId);
          if (!itemRow) {
            return null;
          }
          if (input.userId && itemRow.userId !== input.userId) {
            return null;
          }
          return {
            id: episodeRow.id,
            itemId: episodeRow.itemId,
            audioPath: episodeRow.audioPath,
            item: {
              status: itemRow.status,
              sourceType: itemRow.sourceType,
              sourceUrl: itemRow.sourceUrl,
              sourceFilePath: itemRow.sourceFilePath,
              sourceHtml: itemRow.sourceHtml
            }
          };
        })()
      : await prisma.episode.findFirst({
          where: {
            id: episodeId,
            ...(input.userId ? { item: { userId: input.userId } } : {})
          },
          select: {
            id: true,
            itemId: true,
            audioPath: true,
            item: {
              select: {
                status: true,
                sourceType: true,
                sourceUrl: true,
                sourceFilePath: true,
                sourceHtml: true
              }
            }
          }
        });

  if (!episode) {
    return { enqueued: false, skippedReason: "episode_not_found" };
  }

  if (input.expectedAudioPath && episode.audioPath !== input.expectedAudioPath) {
    return { enqueued: false, itemId: episode.itemId, skippedReason: "audio_path_mismatch" };
  }

  const alternatePath = deriveAlternateAudioPath(episode.audioPath);
  if (alternatePath) {
    const alternateHead = await getArtifactStorage()
      .headObject(alternatePath)
      .catch(() => null);
    if (alternateHead && alternateHead.bytes > 0) {
      const resolvedEpisode: ResolvedEpisodeMedia = {
        audioPath: alternatePath,
        audioBytes: alternateHead.bytes,
        mimeType: inferMimeType(alternatePath, alternateHead.contentType)
      };

      if (webUsesAzureTablePrimary() && webPrimaryStore) {
        const store = webPrimaryStore;
        await store.updateEpisode(episode.id, {
          audioPath: resolvedEpisode.audioPath,
          audioBytes: resolvedEpisode.audioBytes,
          mimeType: resolvedEpisode.mimeType
        });
        await store.deleteChunkCachesByItemId(episode.itemId);
        if (episode.item.status !== "PROCESSING") {
          await store.updateItem(episode.itemId, {
            status: "READY",
            errorCode: null,
            errorMessage: null
          });
        }
        const jobs = await store.listJobsByItemId(episode.itemId);
        await Promise.all(
          jobs
            .filter((job) => job.status === "QUEUED" || job.status === "PROCESSING")
            .map((job) =>
              store.updateJob(job.id, {
                status: "SUCCEEDED",
                lockedAt: null,
                nextRetryAt: null,
                errorCode: null,
                errorMessage: "Recovered missing audio via alternate media object."
              })
            )
        );
      } else {
        await prisma.$transaction(async (tx) => {
          await tx.episode.update({
            where: { id: episode.id },
            data: {
              audioPath: resolvedEpisode.audioPath,
              audioBytes: resolvedEpisode.audioBytes,
              mimeType: resolvedEpisode.mimeType
            }
          });

          await tx.chunkCache.deleteMany({ where: { itemId: episode.itemId } });
          await tx.item.updateMany({
            where: {
              id: episode.itemId,
              status: {
                not: "PROCESSING"
              }
            },
            data: {
              status: "READY",
              errorCode: null,
              errorMessage: null
            }
          });
          await tx.job.updateMany({
            where: {
              itemId: episode.itemId,
              status: {
                in: ["QUEUED", "PROCESSING"]
              }
            },
            data: {
              status: "SUCCEEDED",
              lockedAt: null,
              nextRetryAt: null,
              errorCode: null,
              errorMessage: "Recovered missing audio via alternate media object."
            }
          });
        });
      }

      return {
        enqueued: false,
        itemId: episode.itemId,
        resolvedEpisode
      };
    }
  }

  if (!canRegenerateMedia(episode.item)) {
    return { enqueued: false, itemId: episode.itemId, skippedReason: "not_repairable" };
  }

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const store = webPrimaryStore;
    const item = await store.findItemById(episode.itemId);
    if (!item) {
      return { enqueued: false, skippedReason: "episode_not_found" as const };
    }
    if (item.status === "PROCESSING") {
      return { enqueued: false, itemId: episode.itemId, skippedReason: "processing" as const };
    }
    const activeJob = (await store.listJobsByItemId(episode.itemId)).find(
      (job) => job.status === "QUEUED" || job.status === "PROCESSING"
    );
    if (activeJob) {
      return { enqueued: false, itemId: episode.itemId, skippedReason: "active_job" as const };
    }
    await store.deleteChunkCachesByItemId(episode.itemId);
    await store.updateItem(episode.itemId, {
      status: "QUEUED",
      errorCode: null,
      errorMessage: input.reason || "Rebuilding missing audio file..."
    });
    await store.createJob({
      id: randomUUID(),
      itemId: episode.itemId,
      userId: item.userId,
      status: "QUEUED",
      attempt: 0
    });
    return { enqueued: true, itemId: episode.itemId };
  }

  return prisma.$transaction(async (tx) => {
    const item = await tx.item.findUnique({
      where: { id: episode.itemId },
      select: { status: true }
    });

    if (!item) {
      return { enqueued: false, skippedReason: "episode_not_found" as const };
    }

    if (item.status === "PROCESSING") {
      return { enqueued: false, itemId: episode.itemId, skippedReason: "processing" as const };
    }

    const activeJob = await tx.job.findFirst({
      where: {
        itemId: episode.itemId,
        status: {
          in: ["QUEUED", "PROCESSING"]
        }
      },
      select: {
        id: true
      }
    });

    if (activeJob) {
      return { enqueued: false, itemId: episode.itemId, skippedReason: "active_job" as const };
    }

    await tx.chunkCache.deleteMany({ where: { itemId: episode.itemId } });

    await tx.item.update({
      where: { id: episode.itemId },
      data: {
        status: "QUEUED",
        errorCode: null,
        errorMessage: input.reason || "Rebuilding missing audio file..."
      }
    });

    await tx.job.create({
      data: {
        itemId: episode.itemId,
        status: "QUEUED",
        attempt: 0
      }
    });

    return { enqueued: true, itemId: episode.itemId };
  });
}
