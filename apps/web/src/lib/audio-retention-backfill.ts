import { webPrimaryStore, webUsesAzureTablePrimary } from "./metadata-primary-store";
import { prisma } from "./prisma";
import { buildAudioExpiryDate } from "./audio-retention";

type EpisodeExpiryRecord = {
  id: string;
  publishedAt: Date;
  expiresAt: Date | null;
};

export type AudioRetentionBackfillOptions = {
  dryRun?: boolean;
};

export type AudioRetentionBackfillSummary = {
  dryRun: boolean;
  scanned: number;
  updated: number;
  unchanged: number;
  itemEpisodesUpdated: number;
  digestEpisodesUpdated: number;
  summaryEpisodesUpdated: number;
};

function needsExpiryUpdate(record: EpisodeExpiryRecord): { expected: Date; changed: boolean } {
  const expected = buildAudioExpiryDate(record.publishedAt);
  return {
    expected,
    changed: !record.expiresAt || record.expiresAt.getTime() !== expected.getTime()
  };
}

export async function backfillAudioRetention(options: AudioRetentionBackfillOptions = {}): Promise<AudioRetentionBackfillSummary> {
  const dryRun = options.dryRun === true;
  let scanned = 0;
  let updated = 0;
  let unchanged = 0;
  let itemEpisodesUpdated = 0;
  let digestEpisodesUpdated = 0;
  let summaryEpisodesUpdated = 0;

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const [episodes, digestEpisodes, summaryEpisodes] = await Promise.all([
      webPrimaryStore.listAllEpisodes(),
      webPrimaryStore.listAllDigestEpisodes(),
      webPrimaryStore.listAllSummaryEpisodes()
    ]);

    for (const episode of episodes) {
      scanned += 1;
      const { expected, changed } = needsExpiryUpdate(episode);
      if (!changed) {
        unchanged += 1;
        continue;
      }
      if (!dryRun) {
        const saved = await webPrimaryStore.updateEpisode(episode.id, { expiresAt: expected });
        if (!saved) {
          continue;
        }
      }
      updated += 1;
      itemEpisodesUpdated += 1;
    }

    for (const episode of digestEpisodes) {
      scanned += 1;
      const { expected, changed } = needsExpiryUpdate(episode);
      if (!changed) {
        unchanged += 1;
        continue;
      }
      if (!dryRun) {
        const saved = await webPrimaryStore.updateDigestEpisode(episode.id, { expiresAt: expected });
        if (!saved) {
          continue;
        }
      }
      updated += 1;
      digestEpisodesUpdated += 1;
    }

    for (const episode of summaryEpisodes) {
      scanned += 1;
      const { expected, changed } = needsExpiryUpdate(episode);
      if (!changed) {
        unchanged += 1;
        continue;
      }
      if (!dryRun) {
        const saved = await webPrimaryStore.updateSummaryEpisode(episode.id, { expiresAt: expected });
        if (!saved) {
          continue;
        }
      }
      updated += 1;
      summaryEpisodesUpdated += 1;
    }

    return {
      dryRun,
      scanned,
      updated,
      unchanged,
      itemEpisodesUpdated,
      digestEpisodesUpdated,
      summaryEpisodesUpdated
    };
  }

  const [episodes, digestEpisodes, summaryEpisodes] = await Promise.all([
    prisma.episode.findMany({
      select: {
        id: true,
        publishedAt: true,
        expiresAt: true
      }
    }),
    prisma.digestEpisode.findMany({
      select: {
        id: true,
        publishedAt: true,
        expiresAt: true
      }
    }),
    prisma.summaryEpisode.findMany({
      select: {
        id: true,
        publishedAt: true,
        expiresAt: true
      }
    })
  ]);

  for (const episode of episodes) {
    scanned += 1;
    const { expected, changed } = needsExpiryUpdate(episode);
    if (!changed) {
      unchanged += 1;
      continue;
    }
    if (!dryRun) {
      const result = await prisma.episode.updateMany({
        where: { id: episode.id },
        data: {
          expiresAt: expected
        }
      });
      if (result.count === 0) {
        continue;
      }
    }
    updated += 1;
    itemEpisodesUpdated += 1;
  }

  for (const episode of digestEpisodes) {
    scanned += 1;
    const { expected, changed } = needsExpiryUpdate(episode);
    if (!changed) {
      unchanged += 1;
      continue;
    }
    if (!dryRun) {
      const result = await prisma.digestEpisode.updateMany({
        where: { id: episode.id },
        data: {
          expiresAt: expected
        }
      });
      if (result.count === 0) {
        continue;
      }
    }
    updated += 1;
    digestEpisodesUpdated += 1;
  }

  for (const episode of summaryEpisodes) {
    scanned += 1;
    const { expected, changed } = needsExpiryUpdate(episode);
    if (!changed) {
      unchanged += 1;
      continue;
    }
    if (!dryRun) {
      const result = await prisma.summaryEpisode.updateMany({
        where: { id: episode.id },
        data: {
          expiresAt: expected
        }
      });
      if (result.count === 0) {
        continue;
      }
    }
    updated += 1;
    summaryEpisodesUpdated += 1;
  }

  return {
    dryRun,
    scanned,
    updated,
    unchanged,
    itemEpisodesUpdated,
    digestEpisodesUpdated,
    summaryEpisodesUpdated
  };
}
