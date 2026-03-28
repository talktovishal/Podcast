import { verifyStableMediaUrl } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { contentTypeForPath, parseRangeHeader, validateLegacyMediaToken } from "@/lib/media-utils";
import { findPrimaryActiveFeedTokenByUserId } from "@/lib/metadata-primary-auth";
import { webPrimaryStore, webUsesAzureTablePrimary } from "@/lib/metadata-primary-store";
import { podcastRequestLogMeta } from "@/lib/podcast-request-log";
import { prisma } from "@/lib/prisma";
import { getArtifactStorage } from "@/lib/storage";

const DIGEST_MEDIA_ROUTE = "/api/digest-media/[...path]";

async function resolveScopedEpisode(
  path: string,
  digestEpisodeId: string | null,
  summaryEpisodeId: string | null
): Promise<{ id: string; userId: string } | null> {
  if (!digestEpisodeId && !summaryEpisodeId) {
    return null;
  }

  if (digestEpisodeId) {
    const digestEpisode =
      webUsesAzureTablePrimary() && webPrimaryStore
        ? await webPrimaryStore.findDigestEpisodeById(digestEpisodeId)
        : await prisma.digestEpisode.findFirst({
            where: { id: digestEpisodeId },
            select: { id: true, audioPath: true, userId: true }
          });
    if (!digestEpisode || digestEpisode.audioPath !== path) {
      return null;
    }
    return {
      id: digestEpisode.id,
      userId: digestEpisode.userId
    };
  }

  const summaryEpisode =
    webUsesAzureTablePrimary() && webPrimaryStore
      ? await webPrimaryStore.findSummaryEpisodeById(summaryEpisodeId as string)
      : await prisma.summaryEpisode.findFirst({
          where: { id: summaryEpisodeId as string },
          select: { id: true, audioPath: true, userId: true }
        });
  if (!summaryEpisode || summaryEpisode.audioPath !== path) {
    return null;
  }
  return {
    id: summaryEpisode.id,
    userId: summaryEpisode.userId
  };
}

async function validateStableMediaToken(
  path: string,
  token: string | null,
  digestEpisodeId: string | null,
  summaryEpisodeId: string | null
): Promise<boolean> {
  if (!token) {
    return false;
  }

  const scopedEpisode = await resolveScopedEpisode(path, digestEpisodeId, summaryEpisodeId);
  if (!scopedEpisode) {
    return false;
  }

  if (!env.mediaSigningKey) {
    return token.length > 0;
  }

  const activeFeedToken = await findPrimaryActiveFeedTokenByUserId(scopedEpisode.userId, "digest");
  if (!activeFeedToken) {
    return false;
  }

  return verifyStableMediaUrl(path, token, env.mediaSigningKey, activeFeedToken.tokenHash, scopedEpisode.id).valid;
}

async function authorizeScopedEpisode(path: string, digestEpisodeId: string | null, summaryEpisodeId: string | null): Promise<boolean> {
  if (!digestEpisodeId && !summaryEpisodeId) {
    return true;
  }

  return Boolean(await resolveScopedEpisode(path, digestEpisodeId, summaryEpisodeId));
}

export async function HEAD(request: NextRequest, context: { params: { path: string[] } }) {
  const startedAt = Date.now();
  const requestMeta = podcastRequestLogMeta(request);
  const rawKey = context.params.path.join("/");
  if (rawKey.includes("..")) {
    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast media request rejected", {
        ...requestMeta,
        route: DIGEST_MEDIA_ROUTE,
        status: 400,
        media_kind: "digest",
        reason: "path_traversal",
        duration_ms: Date.now() - startedAt
      });
    }
    return new NextResponse(null, { status: 400 });
  }

  const mediaToken = request.nextUrl.searchParams.get("mt");
  const digestEpisodeId = request.nextUrl.searchParams.get("deid");
  const summaryEpisodeId = request.nextUrl.searchParams.get("seid");
  const isAuthorized =
    (await validateStableMediaToken(rawKey, mediaToken, digestEpisodeId, summaryEpisodeId)) ||
    validateLegacyMediaToken(rawKey, mediaToken);
  if (!isAuthorized) {
    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast media request unauthorized", {
        ...requestMeta,
        route: DIGEST_MEDIA_ROUTE,
        status: 401,
        media_kind: "digest",
        has_media_token: Boolean(mediaToken)
      });
    }
    return new NextResponse(null, { status: 401 });
  }

  if (!(await authorizeScopedEpisode(rawKey, digestEpisodeId, summaryEpisodeId))) {
    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast media request unauthorized", {
        ...requestMeta,
        route: DIGEST_MEDIA_ROUTE,
        status: 401,
        media_kind: "digest",
        reason: "digest_episode_scope_mismatch",
        digest_episode_id: digestEpisodeId,
        summary_episode_id: summaryEpisodeId
      });
    }
    return new NextResponse(null, { status: 401 });
  }

  const key = rawKey;

  try {
    const storage = getArtifactStorage();
    const head = await storage.headObject(key);
    if (env.podcastRequestLoggingEnabled) {
      await logger.info("Podcast media request served", {
        ...requestMeta,
        route: DIGEST_MEDIA_ROUTE,
        status: 200,
        media_kind: "digest",
        media_key: key,
        digest_episode_id: digestEpisodeId,
        summary_episode_id: summaryEpisodeId,
        mime_type: head.contentType || contentTypeForPath(key),
        total_bytes: head.bytes,
        served_bytes: 0,
        response_mode: "HEAD",
        duration_ms: Date.now() - startedAt
      });
    }

    return new NextResponse(null, {
      status: 200,
      headers: {
        "content-type": head.contentType || contentTypeForPath(key),
        "content-length": String(head.bytes),
        "accept-ranges": "bytes"
      }
    });
  } catch {
    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast media object not found", {
        ...requestMeta,
        route: DIGEST_MEDIA_ROUTE,
        status: 404,
        media_kind: "digest",
        media_key: key,
        digest_episode_id: digestEpisodeId,
        summary_episode_id: summaryEpisodeId,
        duration_ms: Date.now() - startedAt
      });
    }
    return new NextResponse(null, { status: 404 });
  }
}

export async function GET(request: NextRequest, context: { params: { path: string[] } }) {
  const startedAt = Date.now();
  const requestMeta = podcastRequestLogMeta(request);
  const rawKey = context.params.path.join("/");
  if (rawKey.includes("..")) {
    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast media request rejected", {
        ...requestMeta,
        route: DIGEST_MEDIA_ROUTE,
        status: 400,
        media_kind: "digest",
        reason: "path_traversal",
        duration_ms: Date.now() - startedAt
      });
    }
    return new NextResponse("Bad Request", { status: 400 });
  }

  const mediaToken = request.nextUrl.searchParams.get("mt");
  const digestEpisodeId = request.nextUrl.searchParams.get("deid");
  const summaryEpisodeId = request.nextUrl.searchParams.get("seid");
  const isAuthorized =
    (await validateStableMediaToken(rawKey, mediaToken, digestEpisodeId, summaryEpisodeId)) ||
    validateLegacyMediaToken(rawKey, mediaToken);
  if (!isAuthorized) {
    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast media request unauthorized", {
        ...requestMeta,
        route: DIGEST_MEDIA_ROUTE,
        status: 401,
        media_kind: "digest",
        has_media_token: Boolean(mediaToken),
        has_digest_episode_id: Boolean(digestEpisodeId)
      });
    }
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (!(await authorizeScopedEpisode(rawKey, digestEpisodeId, summaryEpisodeId))) {
    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast media request unauthorized", {
        ...requestMeta,
        route: DIGEST_MEDIA_ROUTE,
        status: 401,
        media_kind: "digest",
        reason: "digest_episode_scope_mismatch",
        digest_episode_id: digestEpisodeId,
        summary_episode_id: summaryEpisodeId
      });
    }
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const key = rawKey;

  try {
    const storage = getArtifactStorage();
    const head = await storage.headObject(key);
    const size = head.bytes;
    const mimeType = head.contentType || contentTypeForPath(key);
    const range = request.headers.get("range");

    if (!range) {
      const full = await storage.getObject(key);
      if (env.podcastRequestLoggingEnabled) {
        await logger.info("Podcast media request served", {
          ...requestMeta,
          route: DIGEST_MEDIA_ROUTE,
          status: 200,
          media_kind: "digest",
          media_key: key,
          digest_episode_id: digestEpisodeId,
          summary_episode_id: summaryEpisodeId,
          mime_type: mimeType,
          total_bytes: size,
          served_bytes: size,
          duration_ms: Date.now() - startedAt
        });
      }
      return new NextResponse(new Uint8Array(full), {
        status: 200,
        headers: {
          "content-type": mimeType,
          "content-length": String(size),
          "accept-ranges": "bytes"
        }
      });
    }

    const parsedRange = parseRangeHeader(range, size);
    if (!parsedRange) {
      if (env.podcastRequestLoggingEnabled) {
        await logger.warn("Podcast media request invalid range", {
          ...requestMeta,
          route: DIGEST_MEDIA_ROUTE,
          status: 416,
          media_kind: "digest",
          media_key: key,
          digest_episode_id: digestEpisodeId,
          summary_episode_id: summaryEpisodeId,
          total_bytes: size,
          duration_ms: Date.now() - startedAt
        });
      }
      return new NextResponse("Invalid range", {
        status: 416,
        headers: {
          "content-range": `bytes */${size}`
        }
      });
    }

    const { start, end } = parsedRange;
    const chunk = await storage.getObject(key, { start, end });
    const chunkSize = chunk.byteLength;
    if (env.podcastRequestLoggingEnabled) {
      await logger.info("Podcast media request served", {
        ...requestMeta,
        route: DIGEST_MEDIA_ROUTE,
        status: 206,
        media_kind: "digest",
        media_key: key,
        digest_episode_id: digestEpisodeId,
        summary_episode_id: summaryEpisodeId,
        mime_type: mimeType,
        total_bytes: size,
        served_bytes: chunkSize,
        range_start: start,
        range_end: end,
        content_range: `bytes ${start}-${end}/${size}`,
        duration_ms: Date.now() - startedAt
      });
    }

    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: {
        "content-type": mimeType,
        "content-length": String(chunkSize),
        "content-range": `bytes ${start}-${end}/${size}`,
        "accept-ranges": "bytes"
      }
    });
  } catch {
    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast media object not found", {
        ...requestMeta,
        route: DIGEST_MEDIA_ROUTE,
        status: 404,
        media_kind: "digest",
        media_key: key,
        digest_episode_id: digestEpisodeId,
        summary_episode_id: summaryEpisodeId,
        duration_ms: Date.now() - startedAt
      });
    }
    return new NextResponse("Not found", { status: 404 });
  }
}
