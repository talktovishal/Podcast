import { buildRssXml, hashIncomingToken, signMediaUrl } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { BRAND_NAME } from "@articlepod/core/src/config/brand";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enqueueEpisodeMediaRepair } from "@/lib/media-repair";
import { podcastRequestLogMeta } from "@/lib/podcast-request-log";
import { prisma } from "@/lib/prisma";
import { getArtifactStorage } from "@/lib/storage";
import { BRAND_PODCAST_COVER_PATH, absoluteBrandAssetUrl } from "@/lib/brand-assets";

const FEED_ROUTE = "/rss/[token]";

function normalizeFeedToken(value: string): string {
  return value.replace(/\.xml$/i, "");
}

export async function GET(request: NextRequest, context: { params: { token: string } }) {
  const startedAt = Date.now();
  const requestMeta = podcastRequestLogMeta(request);
  const token = normalizeFeedToken(context.params.token);
  const tokenHash = hashIncomingToken(token);
  const feed = await prisma.feedToken.findFirst({
    where: {
      tokenHash,
      active: true
    },
    include: {
      user: true
    }
  });

  if (!feed) {
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

  const episodes = await prisma.episode.findMany({
    where: {
      item: {
        userId: feed.userId,
        status: "READY"
      }
    },
    include: {
      item: true
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }]
  });
  const storage = getArtifactStorage();
  const availableEpisodes: typeof episodes = [];
  let missingEpisodeCount = 0;
  let repairEnqueuedCount = 0;

  for (const episode of episodes) {
    const exists = await storage.headObject(episode.audioPath).then(() => true).catch(() => false);
    if (exists) {
      availableEpisodes.push(episode);
      continue;
    }

    missingEpisodeCount += 1;
    const repair = await enqueueEpisodeMediaRepair({
      episodeId: episode.id,
      userId: feed.userId,
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
        user_id: feed.userId,
        episode_id: episode.id,
        item_id: episode.itemId,
        media_key: episode.audioPath,
        repair_enqueued: repair.enqueued
      });
    }
  }

  const xml = buildRssXml({
    title: `${feed.user.name || feed.user.email} - ${BRAND_NAME}`,
    description: `Private ${BRAND_NAME} feed`,
    link: env.appUrl,
    feedUrl: `${env.appUrl}/rss/${token}.xml`,
    language: "en-us",
    imageUrl: absoluteBrandAssetUrl(env.appUrl, BRAND_PODCAST_COVER_PATH),
    episodes: availableEpisodes.map((episode) => {
      const mediaPath = episode.audioPath;
      const mediaToken = signMediaUrl(mediaPath, env.mediaSigningKey || episode.guid);
      return {
        guid: episode.guid,
        title: episode.title,
        description: episode.description,
        pubDate: episode.publishedAt,
        enclosureUrl: `${env.appUrl}/api/media/${mediaPath}?mt=${encodeURIComponent(mediaToken)}&eid=${episode.id}`,
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
      user_id: feed.userId,
      episode_count: availableEpisodes.length,
      missing_episode_count: missingEpisodeCount,
      repair_enqueued_count: repairEnqueuedCount,
      enclosure_mime_types: Array.from(new Set(availableEpisodes.map((episode) => episode.mimeType))).sort(),
      duration_ms: Date.now() - startedAt
    });
  }

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "private, no-store"
    }
  });
}

export async function HEAD(request: NextRequest, context: { params: { token: string } }) {
  const startedAt = Date.now();
  const requestMeta = podcastRequestLogMeta(request);
  const tokenHash = hashIncomingToken(normalizeFeedToken(context.params.token));
  const exists = await prisma.feedToken.findFirst({ where: { tokenHash, active: true }, select: { id: true } });
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
  return new NextResponse(null, { status: exists ? 200 : 404 });
}
