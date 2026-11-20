import type { PrismaClient } from "@prisma/client";
import { isAudioAvailable } from "./audio-retention";
import { webPrimaryStore, webUsesAzureTablePrimary } from "./metadata-primary-store";
import { prisma } from "./prisma";
import { filterReadyItemEpisodes } from "./rss-item-eligibility";

export type MainFeedEpisode = {
  id: string;
  itemId: string | null;
  guid: string;
  title: string;
  description: string;
  audioPath: string;
  audioBytes: number;
  mimeType: string;
  publishedAt: Date;
  feedKind: "item" | "summary";
};

type StoredFeedEpisode = Omit<MainFeedEpisode, "itemId" | "feedKind"> & { expiresAt: Date | null };
type AzureFeedReads = {
  listEpisodesForUser(userId: string): Promise<(StoredFeedEpisode & { itemId: string })[]>;
  listSummaryEpisodesForUser(userId: string): Promise<StoredFeedEpisode[]>;
  findItemById(id: string): Promise<{ userId: string; status: string } | null>;
};
type MainFeedReader = (userId: string, now: Date) => Promise<MainFeedEpisode[]>;

function comparePublishedDesc(left: MainFeedEpisode, right: MainFeedEpisode): number {
  return right.publishedAt.getTime() - left.publishedAt.getTime() || left.id.localeCompare(right.id);
}

export function createMainFeedReader(
  azure: AzureFeedReads | null,
  sql: Pick<PrismaClient, "episode" | "summaryEpisode">
): MainFeedReader {
  if (azure) {
    return async (userId, now) => {
      const [episodeRows, summaryEpisodes] = await Promise.all([
        azure.listEpisodesForUser(userId),
        azure.listSummaryEpisodesForUser(userId)
      ]);
      const eligibleEpisodes = await filterReadyItemEpisodes(
        episodeRows.filter((episode) => isAudioAvailable(episode.expiresAt, now)),
        userId,
        (id) => azure.findItemById(id)
      );
      return [
        ...eligibleEpisodes.map((episode) => ({
          id: episode.id,
          itemId: episode.itemId,
          guid: episode.guid,
          title: episode.title,
          description: episode.description,
          audioPath: episode.audioPath,
          audioBytes: episode.audioBytes,
          mimeType: episode.mimeType,
          publishedAt: episode.publishedAt,
          feedKind: "item" as const
        })),
        ...summaryEpisodes
          .filter((episode) => isAudioAvailable(episode.expiresAt, now))
          .map((episode) => ({
            id: episode.id,
            itemId: null,
            guid: episode.guid,
            title: episode.title,
            description: episode.description,
            audioPath: episode.audioPath,
            audioBytes: episode.audioBytes,
            mimeType: episode.mimeType,
            publishedAt: episode.publishedAt,
            feedKind: "summary" as const
          }))
      ].sort(comparePublishedDesc);
    };
  }

  return async (userId, now) => {
    const [itemEpisodes, summaryEpisodes] = await Promise.all([
      sql.episode.findMany({
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          item: { userId, status: "READY" }
        },
        select: {
          id: true,
          itemId: true,
          guid: true,
          title: true,
          description: true,
          audioPath: true,
          audioBytes: true,
          mimeType: true,
          publishedAt: true
        },
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }]
      }),
      sql.summaryEpisode.findMany({
        where: {
          userId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
        },
        select: {
          id: true,
          guid: true,
          title: true,
          description: true,
          audioPath: true,
          audioBytes: true,
          mimeType: true,
          publishedAt: true
        },
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }]
      })
    ]);
    return [
      ...itemEpisodes.map((episode) => ({ ...episode, feedKind: "item" as const })),
      ...summaryEpisodes.map((episode) => ({ ...episode, itemId: null, feedKind: "summary" as const }))
    ].sort(comparePublishedDesc);
  };
}

export const listMainFeedEpisodes = createMainFeedReader(
  webUsesAzureTablePrimary() ? webPrimaryStore : null,
  prisma
);
