import { buildRssXml, hashIncomingToken, signStableMediaUrl } from "@articlepod/core";
import { BRAND_NAME } from "@articlepod/core/src/config/brand";
import { NextRequest, NextResponse } from "next/server";
import { isAudioAvailable } from "@/lib/audio-retention";
import { BRAND_PODCAST_COVER_PATH, absoluteBrandAssetUrl } from "@/lib/brand-assets";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enqueueEpisodeMediaRepair } from "@/lib/media-repair";
import { findPrimaryUserByFeedTokenHash, repairPrimaryFeedTokenHashFromValue } from "@/lib/metadata-primary-auth";
import { webPrimaryStore, webUsesAzureTablePrimary } from "@/lib/metadata-primary-store";
import { podcastRequestLogMeta } from "@/lib/podcast-request-log";
import { prisma } from "@/lib/prisma";
import { getArtifactStorage } from "@/lib/storage";

const FEED_ROUTE = "/rss/[token]";
const FEED_HEADERS = {
  "content-type": "application/rss+xml; charset=utf-8",
  "cache-control": "private, no-store"
};

type MainFeedEpisode = {
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

function normalizeFeedToken(value: string): string {
  return value.replace(/\.xml$/i, "");
}

function comparePublishedDesc<T extends { publishedAt: Date; id: string }>(left: T, right: T): number {
  return right.publishedAt.getTime() - left.publishedAt.getTime() || left.id.localeCompare(right.id);
}

async function resolveItemFeedAccess(token: string) {
  const tokenHash = hashIncomingToken(token);
  const user = await findPrimaryUserByFeedTokenHash(tokenHash, "item");
  if (user) {
    return { user, tokenHash, repaired: false };
  }

  const repaired = await repairPrimaryFeedTokenHashFromValue(token, "item");
  if (!repaired) {
    return null;
  }

  return {
    user: repaired,
    tokenHash: repaired.repairedTokenHash,
    repaired: true
  };
}

export async function GET(request: NextRequest, context: { params: { token: string } }) {
  const startedAt = Date.now();
  const requestMeta = podcastRequestLogMeta(request);
  const token = normalizeFeedToken(context.params.token);
  const resolvedAccess = await resolveItemFeedAccess(token);

  if (!resolvedAccess) {
    const tokenHash = hashIncomingToken(token);
    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast feed request not found", {
        ...requestMeta,
        route: FEED_ROUTE,
        feed_kind: "item",
        status: 404,
        feed_hash_prefix: tokenHash.slice(0, 12),
        duration_ms: Date.now() - startedAt
      });
    }
    return new NextResponse("Feed not found", { status: 404 });
  }
  const { user, tokenHash, repaired } = resolvedAccess;

  const now = new Date();
  const episodes: MainFeedEpisode[] =
    webUsesAzureTablePrimary() && webPrimaryStore
      ? await (async () => {
          const [episodeRows, itemRows, summaryEpisodes] = await Promise.all([
            webPrimaryStore.listEpisodesForUser(user.id),
            webPrimaryStore.listItemsByUser(user.id, 500),
            webPrimaryStore.listSummaryEpisodesForUser(user.id)
          ]);
          const readyItemIds = new Set(itemRows.filter((item) => item.status === "READY").map((item) => item.id));
          return [
            ...episodeRows
              .filter((episode) => readyItemIds.has(episode.itemId) && isAudioAvailable(episode.expiresAt, now))
              .map((episode) => ({
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
        })()
      : await (async () => {
          const [itemEpisodes, summaryEpisodes] = await Promise.all([
            prisma.episode.findMany({
              where: {
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                item: {
                  userId: user.id,
                  status: "READY"
                }
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
            prisma.summaryEpisode.findMany({
              where: {
                userId: user.id,
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
            ...itemEpisodes.map((episode) => ({
              ...episode,
              feedKind: "item" as const
            })),
            ...summaryEpisodes.map((episode) => ({
              ...episode,
              itemId: null,
              feedKind: "summary" as const
            }))
          ].sort(comparePublishedDesc);
        })();
  const storage = getArtifactStorage();
  const availableEpisodes: MainFeedEpisode[] = [];
  let missingEpisodeCount = 0;
  let repairEnqueuedCount = 0;

  for (const episode of episodes) {
    const exists = await storage.headObject(episode.audioPath).then(() => true).catch(() => false);
    if (exists) {
      availableEpisodes.push(episode);
      continue;
    }

    missingEpisodeCount += 1;

    if (episode.feedKind === "summary") {
      if (env.podcastRequestLoggingEnabled) {
        await logger.warn("Podcast feed item skipped due to missing media", {
          ...requestMeta,
          route: FEED_ROUTE,
          feed_kind: "item",
          status: 200,
          user_id: user.id,
          summary_episode_id: episode.id,
          media_key: episode.audioPath,
          repair_enqueued: false
        });
      }
      continue;
    }

    const repair = await enqueueEpisodeMediaRepair({
      episodeId: episode.id,
      userId: user.id,
      expectedAudioPath: episode.audioPath,
      reason: "Audio file was missing and has been queued for regeneration."
    }).catch(() => ({ enqueued: false as const, resolvedEpisode: undefined }));

    if (repair.resolvedEpisode) {
      availableEpisodes.push({
        ...episode,
        audioPath: repair.resolvedEpisode.audioPath,
        audioBytes: repair.resolvedEpisode.audioBytes,
        mimeType: repair.resolvedEpisode.mimeType
      });
      continue;
    }

    if (repair.enqueued) {
      repairEnqueuedCount += 1;
    }

    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast feed item skipped due to missing media", {
        ...requestMeta,
        route: FEED_ROUTE,
        feed_kind: "item",
        status: 200,
        user_id: user.id,
        episode_id: episode.id,
        item_id: episode.itemId,
        media_key: episode.audioPath,
        repair_enqueued: repair.enqueued
      });
    }
  }

  const xml = buildRssXml({
    title: `${user.name || user.email} - ${BRAND_NAME}`,
    description: `Private ${BRAND_NAME} feed`,
    link: env.appUrl,
    feedUrl: `${env.appUrl}/rss/${token}.xml`,
    language: "en-us",
    imageUrl: absoluteBrandAssetUrl(env.appUrl, BRAND_PODCAST_COVER_PATH),
    episodes: availableEpisodes.map((episode) => {
      const mediaPath = episode.audioPath;
      const mediaToken = signStableMediaUrl(mediaPath, env.mediaSigningKey || episode.guid, tokenHash, episode.id);
      const episodeScope = episode.feedKind === "summary" ? "seid" : "eid";
      return {
        guid: episode.guid,
        title: episode.title,
        description: episode.description,
        pubDate: episode.publishedAt,
        enclosureUrl: `${env.appUrl}/api/media/${mediaPath}?mt=${encodeURIComponent(mediaToken)}&${episodeScope}=${episode.id}`,
        enclosureLength: episode.audioBytes,
        enclosureType: episode.mimeType === "audio/mpeg" ? "audio/mpeg" : "audio/mp4"
      };
    })
  });

  if (env.podcastRequestLoggingEnabled) {
    await logger.info("Podcast feed request served", {
      ...requestMeta,
      route: FEED_ROUTE,
      feed_kind: "item",
      status: 200,
      user_id: user.id,
      episode_count: availableEpisodes.length,
      summary_episode_count: availableEpisodes.filter((episode) => episode.feedKind === "summary").length,
      missing_episode_count: missingEpisodeCount,
      repair_enqueued_count: repairEnqueuedCount,
      enclosure_mime_types: Array.from(new Set(availableEpisodes.map((episode) => episode.mimeType))).sort(),
      feed_token_repaired: repaired,
      duration_ms: Date.now() - startedAt
    });
  }

  return new NextResponse(xml, {
    status: 200,
    headers: FEED_HEADERS
  });
}

export async function HEAD(request: NextRequest, context: { params: { token: string } }) {
  const startedAt = Date.now();
  const requestMeta = podcastRequestLogMeta(request);
  const token = normalizeFeedToken(context.params.token);
  const tokenHash = hashIncomingToken(token);
  const exists = Boolean(await resolveItemFeedAccess(token));
  if (env.podcastRequestLoggingEnabled) {
    await logger.info("Podcast feed request served", {
      ...requestMeta,
      route: FEED_ROUTE,
      feed_kind: "item",
      status: exists ? 200 : 404,
      response_mode: "HEAD",
      feed_hash_prefix: tokenHash.slice(0, 12),
      duration_ms: Date.now() - startedAt
    });
  }
  return new NextResponse(null, { status: exists ? 200 : 404, headers: exists ? FEED_HEADERS : undefined });
}
