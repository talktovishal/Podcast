import { buildRssXml, hashIncomingToken, signMediaUrl } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { BRAND_NAME } from "@articlepod/core/src/config/brand";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { findPrimaryUserByFeedTokenHash } from "@/lib/metadata-primary-auth";
import { webPrimaryStore, webUsesAzureTablePrimary } from "@/lib/metadata-primary-store";
import { podcastRequestLogMeta } from "@/lib/podcast-request-log";
import { prisma } from "@/lib/prisma";
import { BRAND_PODCAST_COVER_PATH, absoluteBrandAssetUrl } from "@/lib/brand-assets";

const DIGEST_FEED_ROUTE = "/rss/digest/[token]";

function normalizeFeedToken(value: string): string {
  return value.replace(/\.xml$/i, "");
}

export async function GET(request: NextRequest, context: { params: { token: string } }) {
  const startedAt = Date.now();
  const requestMeta = podcastRequestLogMeta(request);
  const token = normalizeFeedToken(context.params.token);
  const tokenHash = hashIncomingToken(token);
  const user = await findPrimaryUserByFeedTokenHash(tokenHash, "digest");

  if (!user) {
    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast feed request not found", {
        ...requestMeta,
        route: DIGEST_FEED_ROUTE,
        feed_kind: "digest",
        status: 404,
        feed_hash_prefix: tokenHash.slice(0, 12),
        duration_ms: Date.now() - startedAt
      });
    }
    return new NextResponse("Digest feed not found", { status: 404 });
  }

  const episodes =
    webUsesAzureTablePrimary() && webPrimaryStore
      ? await webPrimaryStore.listDigestEpisodesForUser(user.id)
      : await prisma.digestEpisode.findMany({
          where: {
            userId: user.id
          },
          orderBy: [{ publishedAt: "desc" }, { id: "asc" }]
        });

  const xml = buildRssXml({
    title: `${user.name || user.email} - ${BRAND_NAME} Digest`,
    description: `Private ${BRAND_NAME} daily/weekly digest feed`,
    link: env.appUrl,
    feedUrl: `${env.appUrl}/rss/digest/${token}.xml`,
    language: "en-us",
    imageUrl: absoluteBrandAssetUrl(env.appUrl, BRAND_PODCAST_COVER_PATH),
    episodes: episodes.map((episode) => {
      const mediaPath = episode.audioPath;
      const mediaToken = signMediaUrl(mediaPath, env.mediaSigningKey || episode.guid);
      return {
        guid: episode.guid,
        title: episode.title,
        description: episode.description,
        pubDate: episode.publishedAt,
        enclosureUrl: `${env.appUrl}/api/digest-media/${mediaPath}?mt=${encodeURIComponent(mediaToken)}&deid=${episode.id}`,
        enclosureLength: episode.audioBytes,
        enclosureType: episode.mimeType === "audio/mpeg" ? "audio/mpeg" : "audio/mp4"
      };
    })
  });

  if (env.podcastRequestLoggingEnabled) {
    await logger.info("Podcast feed request served", {
      ...requestMeta,
      route: DIGEST_FEED_ROUTE,
      feed_kind: "digest",
      status: 200,
      user_id: user.id,
      episode_count: episodes.length,
      enclosure_mime_types: Array.from(new Set(episodes.map((episode) => episode.mimeType))).sort(),
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
  const exists = Boolean(await findPrimaryUserByFeedTokenHash(tokenHash, "digest"));
  if (env.podcastRequestLoggingEnabled) {
    await logger.info("Podcast feed request served", {
      ...requestMeta,
      route: DIGEST_FEED_ROUTE,
      feed_kind: "digest",
      status: exists ? 200 : 404,
      response_mode: "HEAD",
      feed_hash_prefix: tokenHash.slice(0, 12),
      duration_ms: Date.now() - startedAt
    });
  }
  return new NextResponse(null, { status: exists ? 200 : 404 });
}
