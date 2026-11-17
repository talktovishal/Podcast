import { webPrimaryStore, webUsesAzureTablePrimary } from "./metadata-primary-store";
import { prisma } from "./prisma";
import { deleteUnreferencedAudioObject } from "./audio-ownership";

export type AudioRetentionPurgeSummary = {
  itemEpisodesPurged: number;
  digestEpisodesPurged: number;
  summaryEpisodesPurged: number;
};

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
      await webPrimaryStore.deleteEpisode(episode.id);
      await deleteUnreferencedAudioObject(episode.audioPath);
      itemEpisodesPurged += 1;
    }

    for (const episode of digestEpisodes.filter((row) => row.expiresAt && row.expiresAt.getTime() <= now.getTime())) {
      await webPrimaryStore.deleteDigestEpisode(episode.id);
      await deleteUnreferencedAudioObject(episode.audioPath);
      digestEpisodesPurged += 1;
    }

    for (const episode of summaryEpisodes.filter((row) => row.expiresAt && row.expiresAt.getTime() <= now.getTime())) {
      await webPrimaryStore.deleteSummaryEpisode(episode.id);
      await deleteUnreferencedAudioObject(episode.audioPath);
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

  for (const path of new Set([...episodes, ...digestEpisodes, ...summaryEpisodes].map((episode) => episode.audioPath))) {
    await deleteUnreferencedAudioObject(path);
  }

  return {
    itemEpisodesPurged,
    digestEpisodesPurged,
    summaryEpisodesPurged
  };
}
