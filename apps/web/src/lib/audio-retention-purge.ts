import { rm } from "node:fs/promises";
import { webPrimaryStore, webUsesAzureTablePrimary } from "./metadata-primary-store";
import { prisma } from "./prisma";
import { getArtifactStorage, isLikelyLegacyAbsolutePath } from "./storage";

export type AudioRetentionPurgeSummary = {
  itemEpisodesPurged: number;
  digestEpisodesPurged: number;
  summaryEpisodesPurged: number;
};

async function deleteAudioObject(path: string): Promise<void> {
  if (isLikelyLegacyAbsolutePath(path)) {
    await rm(path, { force: true }).catch(() => undefined);
    return;
  }
  await getArtifactStorage().deleteObject(path).catch(() => undefined);
}

export async function purgeExpiredAudioEpisodes(now = new Date()): Promise<AudioRetentionPurgeSummary> {
  let itemEpisodesPurged = 0;
  let digestEpisodesPurged = 0;
  let summaryEpisodesPurged = 0;

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const [episodes, digestEpisodes, summaryEpisodes] = await Promise.all([
      webPrimaryStore.listAllEpisodes(),
      webPrimaryStore.listAllDigestEpisodes(),
      webPrimaryStore.listAllSummaryEpisodes()
    ]);

    for (const episode of episodes.filter((row) => row.expiresAt && row.expiresAt.getTime() <= now.getTime())) {
      await deleteAudioObject(episode.audioPath);
      await webPrimaryStore.deleteEpisode(episode.id);
      itemEpisodesPurged += 1;
    }

    for (const episode of digestEpisodes.filter((row) => row.expiresAt && row.expiresAt.getTime() <= now.getTime())) {
      await deleteAudioObject(episode.audioPath);
      await webPrimaryStore.deleteDigestEpisode(episode.id);
      digestEpisodesPurged += 1;
    }

    for (const episode of summaryEpisodes.filter((row) => row.expiresAt && row.expiresAt.getTime() <= now.getTime())) {
      await deleteAudioObject(episode.audioPath);
      await webPrimaryStore.deleteSummaryEpisode(episode.id);
      summaryEpisodesPurged += 1;
    }

    return {
      itemEpisodesPurged,
      digestEpisodesPurged,
      summaryEpisodesPurged
    };
  }

  const [episodes, digestEpisodes, summaryEpisodes] = await Promise.all([
    prisma.episode.findMany({
      where: {
        expiresAt: {
          lte: now
        }
      },
      select: {
        id: true,
        audioPath: true
      }
    }),
    prisma.digestEpisode.findMany({
      where: {
        expiresAt: {
          lte: now
        }
      },
      select: {
        id: true,
        audioPath: true
      }
    }),
    prisma.summaryEpisode.findMany({
      where: {
        expiresAt: {
          lte: now
        }
      },
      select: {
        id: true,
        audioPath: true
      }
    })
  ]);

  for (const episode of episodes) {
    await deleteAudioObject(episode.audioPath);
  }
  for (const episode of digestEpisodes) {
    await deleteAudioObject(episode.audioPath);
  }
  for (const episode of summaryEpisodes) {
    await deleteAudioObject(episode.audioPath);
  }

  itemEpisodesPurged = (
    await prisma.episode.deleteMany({
      where: {
        id: {
          in: episodes.map((episode) => episode.id)
        }
      }
    })
  ).count;

  digestEpisodesPurged = (
    await prisma.digestEpisode.deleteMany({
      where: {
        id: {
          in: digestEpisodes.map((episode) => episode.id)
        }
      }
    })
  ).count;

  summaryEpisodesPurged = (
    await prisma.summaryEpisode.deleteMany({
      where: {
        id: {
          in: summaryEpisodes.map((episode) => episode.id)
        }
      }
    })
  ).count;

  return {
    itemEpisodesPurged,
    digestEpisodesPurged,
    summaryEpisodesPurged
  };
}
