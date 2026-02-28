import { prisma } from "./prisma";

export async function enqueueEpisodeMediaRepair(input: {
  episodeId: string | null | undefined;
  userId: string;
  expectedAudioPath?: string | null;
  reason?: string;
}): Promise<{ enqueued: boolean; itemId?: string }> {
  const episodeId = input.episodeId || "";
  if (!episodeId) {
    return { enqueued: false };
  }

  return prisma.$transaction(async (tx) => {
    const episode = await tx.episode.findFirst({
      where: {
        id: episodeId,
        item: {
          userId: input.userId
        }
      },
      select: {
        id: true,
        itemId: true,
        audioPath: true
      }
    });

    if (!episode) {
      return { enqueued: false };
    }

    if (input.expectedAudioPath && episode.audioPath !== input.expectedAudioPath) {
      return { enqueued: false };
    }

    const item = await tx.item.findUnique({
      where: { id: episode.itemId },
      select: { status: true }
    });

    if (!item) {
      return { enqueued: false };
    }

    if (item.status === "PROCESSING") {
      return { enqueued: false, itemId: episode.itemId };
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
      return { enqueued: false, itemId: episode.itemId };
    }

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
