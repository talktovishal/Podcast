import { verifyMediaUrl } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { podcastRequestLogMeta } from "@/lib/podcast-request-log";
import { prisma } from "@/lib/prisma";
import { getArtifactStorage } from "@/lib/storage";

const DIGEST_MEDIA_ROUTE = "/api/digest-media/[...path]";

function contentTypeForPath(path: string): string {
  if (path.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (path.endsWith(".pdf")) {
    return "application/pdf";
  }
  return "audio/mp4";
}

function validateMediaToken(path: string, token: string | null): boolean {
  if (!token) {
    return false;
  }
  if (!env.mediaSigningKey) {
    return token.length > 0;
  }
  const result = verifyMediaUrl(path, token, env.mediaSigningKey);
  return result.valid;
}

function parseRangeHeader(range: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    return null;
  }

  const startPart = match[1];
  const endPart = match[2];

  if (!startPart && !endPart) {
    return null;
  }

  if (!startPart) {
    const suffixLength = Number(endPart);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }
    const start = suffixLength >= size ? 0 : size - suffixLength;
    return { start, end: size - 1 };
  }

  const start = Number(startPart);
  const end = endPart ? Number(endPart) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
}

async function authorizeDigestEpisode(digestEpisodeId: string | null): Promise<boolean> {
  if (!digestEpisodeId) {
    return true;
  }

  const episode = await prisma.digestEpisode.findFirst({
    where: { id: digestEpisodeId },
    select: { id: true }
  });
  return Boolean(episode);
}

export async function HEAD(request: NextRequest, context: { params: { path: string[] } }) {
  const startedAt = Date.now();
  const requestMeta = podcastRequestLogMeta(request);
  const rawKey = context.params.path.join("/");
  const mediaToken = request.nextUrl.searchParams.get("mt");
  const isAuthorized = validateMediaToken(rawKey, mediaToken);
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

  const digestEpisodeId = request.nextUrl.searchParams.get("deid");
  if (!(await authorizeDigestEpisode(digestEpisodeId))) {
    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast media request unauthorized", {
        ...requestMeta,
        route: DIGEST_MEDIA_ROUTE,
        status: 401,
        media_kind: "digest",
        reason: "digest_episode_scope_mismatch",
        digest_episode_id: digestEpisodeId
      });
    }
    return new NextResponse(null, { status: 401 });
  }

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
  const mediaToken = request.nextUrl.searchParams.get("mt");
  const isAuthorized = validateMediaToken(rawKey, mediaToken);
  if (!isAuthorized) {
    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast media request unauthorized", {
        ...requestMeta,
        route: DIGEST_MEDIA_ROUTE,
        status: 401,
        media_kind: "digest",
        has_media_token: Boolean(mediaToken),
        has_digest_episode_id: Boolean(request.nextUrl.searchParams.get("deid"))
      });
    }
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const digestEpisodeId = request.nextUrl.searchParams.get("deid");
  if (!(await authorizeDigestEpisode(digestEpisodeId))) {
    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast media request unauthorized", {
        ...requestMeta,
        route: DIGEST_MEDIA_ROUTE,
        status: 401,
        media_kind: "digest",
        reason: "digest_episode_scope_mismatch",
        digest_episode_id: digestEpisodeId
      });
    }
    return new NextResponse("Unauthorized", { status: 401 });
  }

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
        duration_ms: Date.now() - startedAt
      });
    }
    return new NextResponse("Not found", { status: 404 });
  }
}
