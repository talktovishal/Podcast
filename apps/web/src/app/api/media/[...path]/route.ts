import { verifyMediaUrl } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { recordAnalyticsEventBestEffort, resolveUserAnalyticsProfile } from "@/lib/admin-analytics/events";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enqueueEpisodeMediaRepair } from "@/lib/media-repair";
import { podcastRequestLogMeta } from "@/lib/podcast-request-log";
import { prisma } from "@/lib/prisma";
import { getArtifactStorage } from "@/lib/storage";

const MEDIA_ROUTE = "/api/media/[...path]";

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
  // In simple profile mediaSigningKey may be empty; accept any non-empty token as fallback
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
        route: MEDIA_ROUTE,
        status: 401,
        media_kind: "item",
        has_media_token: Boolean(mediaToken)
      });
    }
    return new NextResponse(null, { status: 401 });
  }

  if (rawKey.includes("..")) {
    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast media request rejected", {
        ...requestMeta,
        route: MEDIA_ROUTE,
        status: 400,
        media_kind: "item",
        reason: "path_traversal",
        duration_ms: Date.now() - startedAt
      });
    }
    return new NextResponse(null, { status: 400 });
  }
  const key = rawKey;
  const maybeEpisodeId = request.nextUrl.searchParams.get("eid");

  try {
    const storage = getArtifactStorage();
    const head = await storage.headObject(key);
    if (env.podcastRequestLoggingEnabled) {
      await logger.info("Podcast media request served", {
        ...requestMeta,
        route: MEDIA_ROUTE,
        status: 200,
        media_kind: "item",
        media_key: key,
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
    const repair = await enqueueEpisodeMediaRepair({
      episodeId: maybeEpisodeId,
      userId: undefined,
      expectedAudioPath: key,
      reason: "Audio file was missing and has been queued for regeneration."
    }).catch(() => ({ enqueued: false as const, resolvedEpisode: undefined }));

    if (repair.resolvedEpisode) {
      if (env.podcastRequestLoggingEnabled) {
        await logger.info("Podcast media request served", {
          ...requestMeta,
          route: MEDIA_ROUTE,
          status: 200,
          media_kind: "item",
          media_key: repair.resolvedEpisode.audioPath,
          episode_id: maybeEpisodeId,
          mime_type: repair.resolvedEpisode.mimeType,
          total_bytes: repair.resolvedEpisode.audioBytes,
          served_bytes: 0,
          response_mode: "HEAD",
          duration_ms: Date.now() - startedAt
        });
      }

      return new NextResponse(null, {
        status: 200,
        headers: {
          "content-type": repair.resolvedEpisode.mimeType,
          "content-length": String(repair.resolvedEpisode.audioBytes),
          "accept-ranges": "bytes"
        }
      });
    }

    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast media object not found", {
        ...requestMeta,
        route: MEDIA_ROUTE,
        status: 404,
        media_kind: "item",
        media_key: key,
        episode_id: maybeEpisodeId,
        repair_enqueued: repair.enqueued,
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
        route: MEDIA_ROUTE,
        status: 401,
        media_kind: "item",
        has_media_token: Boolean(mediaToken),
        has_episode_id: Boolean(request.nextUrl.searchParams.get("eid"))
      });
    }
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (rawKey.includes("..")) {
    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast media request rejected", {
        ...requestMeta,
        route: MEDIA_ROUTE,
        status: 400,
        media_kind: "item",
        reason: "path_traversal",
        duration_ms: Date.now() - startedAt
      });
    }
    return new NextResponse("Bad Request", { status: 400 });
  }
  const key = rawKey;
  const maybeEpisodeId = request.nextUrl.searchParams.get("eid");

  try {
    const storage = getArtifactStorage();
    const head = await storage.headObject(key);
    const size = head.bytes;
    const mimeType = head.contentType || contentTypeForPath(key);
    const range = request.headers.get("range");
    const now = new Date();
    const maybeLogPlayback = async (isPlaybackLike: boolean): Promise<void> => {
      if (!isPlaybackLike) {
        return;
      }
      const dedupeSource = maybeEpisodeId || key;
      let sourceType: "URL" | "PDF" | "HTML_SNAPSHOT" | null = null;
      let itemId: string | null = null;
      let userId: string | null = null;

      if (maybeEpisodeId) {
        const episode = await prisma.episode.findFirst({
          where: { id: maybeEpisodeId },
          select: {
            itemId: true,
            item: {
              select: {
                sourceType: true,
                userId: true
              }
            }
          }
        });
        itemId = episode?.itemId ?? null;
        userId = episode?.item.userId ?? null;
        const candidate = episode?.item.sourceType;
        if (candidate === "URL" || candidate === "PDF" || candidate === "HTML_SNAPSHOT") {
          sourceType = candidate;
        }
      }

      if (!userId) {
        return;
      }
      const profile = await resolveUserAnalyticsProfile(userId);
      await recordAnalyticsEventBestEffort({
        eventType: "PLAYBACK_STARTED",
        userId,
        itemId,
        sourceType,
        authMethod: profile.authMethod,
        segmentAuth: profile.segmentAuth,
        userRole: profile.userRole,
        dedupeKey: `playback:${userId}:${dedupeSource}:${now.toISOString().slice(0, 10)}`,
        occurredAt: now,
        metadata: {
          range,
          media_key: key,
          episode_id: maybeEpisodeId
        }
      });
    };

    if (!range) {
      const full = await storage.getObject(key);
      void maybeLogPlayback(true).catch(() => undefined);
      if (env.podcastRequestLoggingEnabled) {
        await logger.info("Podcast media request served", {
          ...requestMeta,
          route: MEDIA_ROUTE,
          status: 200,
          media_kind: "item",
          media_key: key,
          episode_id: maybeEpisodeId,
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
          route: MEDIA_ROUTE,
          status: 416,
          media_kind: "item",
          media_key: key,
          episode_id: maybeEpisodeId,
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
    void maybeLogPlayback(start <= 1).catch(() => undefined);
    if (env.podcastRequestLoggingEnabled) {
      await logger.info("Podcast media request served", {
        ...requestMeta,
        route: MEDIA_ROUTE,
        status: 206,
        media_kind: "item",
        media_key: key,
        episode_id: maybeEpisodeId,
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
    const repair = await enqueueEpisodeMediaRepair({
      episodeId: maybeEpisodeId,
      userId: undefined,
      expectedAudioPath: key,
      reason: "Audio file was missing and has been queued for regeneration."
    }).catch(() => ({ enqueued: false as const, resolvedEpisode: undefined }));

    if (repair.resolvedEpisode) {
      const resolvedKey = repair.resolvedEpisode.audioPath;
      const mimeType = repair.resolvedEpisode.mimeType || contentTypeForPath(resolvedKey);
      const size = repair.resolvedEpisode.audioBytes;
      const range = request.headers.get("range");
      const storage = getArtifactStorage();

      if (!range) {
        const full = await storage.getObject(resolvedKey);
        if (env.podcastRequestLoggingEnabled) {
          await logger.info("Podcast media request served", {
            ...requestMeta,
            route: MEDIA_ROUTE,
            status: 200,
            media_kind: "item",
            media_key: resolvedKey,
            episode_id: maybeEpisodeId,
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
            route: MEDIA_ROUTE,
            status: 416,
            media_kind: "item",
            media_key: resolvedKey,
            episode_id: maybeEpisodeId,
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
      const chunk = await storage.getObject(resolvedKey, { start, end });
      const chunkSize = chunk.byteLength;
      if (env.podcastRequestLoggingEnabled) {
        await logger.info("Podcast media request served", {
          ...requestMeta,
          route: MEDIA_ROUTE,
          status: 206,
          media_kind: "item",
          media_key: resolvedKey,
          episode_id: maybeEpisodeId,
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
    }

    if (env.podcastRequestLoggingEnabled) {
      await logger.warn("Podcast media object not found", {
        ...requestMeta,
        route: MEDIA_ROUTE,
        status: 404,
        media_kind: "item",
        media_key: key,
        episode_id: maybeEpisodeId,
        repair_enqueued: repair.enqueued,
        duration_ms: Date.now() - startedAt
      });
    }
    return new NextResponse("Not found", { status: 404 });
  }
}
