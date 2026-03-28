import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { AnalyticsSourceType } from "@articlepod/core";
import { recordAnalyticsEventBestEffort } from "@/lib/admin-analytics/events";
import { getArtifactStorage } from "@/lib/storage";
import {
  getPublicEpisodeShareContextById,
  verifyPublicEpisodeMediaToken
} from "@/lib/share-links";

const SHARE_MEDIA_ROUTE = "/api/share-media/[...path]";

function contentTypeForPath(path: string): string {
  if (path.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (path.endsWith(".pdf")) {
    return "application/pdf";
  }
  return "audio/mp4";
}

function normalizeSourceType(sourceType: string): AnalyticsSourceType | null {
  return sourceType === "URL" || sourceType === "PDF" || sourceType === "HTML_SNAPSHOT" ? sourceType : null;
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

function attachmentDisposition(path: string): string {
  const filename = path.split("/").pop() || "episode.mp3";
  const safeName = filename.replace(/["\r\n]/g, "");
  return `attachment; filename="${safeName}"`;
}

async function authorizeShareMedia(request: NextRequest, path: string) {
  const shareId = request.nextUrl.searchParams.get("sid");
  const token = request.nextUrl.searchParams.get("mt");
  const episodeId = request.nextUrl.searchParams.get("eid");
  if (!shareId || !token || !episodeId) {
    return null;
  }

  const context = await getPublicEpisodeShareContextById(shareId);
  if (!context) {
    return null;
  }

  if (context.episode.id !== episodeId || context.episode.audioPath !== path) {
    return null;
  }

  const valid = verifyPublicEpisodeMediaToken(
    {
      shareId: context.share.id,
      tokenHash: context.share.tokenHash,
      scope: context.share.scope,
      episodeId: context.episode.id,
      path: context.episode.audioPath
    },
    token
  );
  if (!valid) {
    return null;
  }

  return context;
}

async function handle(request: NextRequest, context: { params: { path: string[] } }, headOnly: boolean) {
  const rawPath = context.params.path.join("/");
  if (rawPath.includes("..")) {
    return new NextResponse(headOnly ? null : "Bad Request", { status: 400 });
  }

  const shareContext = await authorizeShareMedia(request, rawPath);
  if (!shareContext) {
    return new NextResponse(headOnly ? null : "Unauthorized", { status: 401 });
  }

  const storage = getArtifactStorage();
  let head;
  try {
    head = await storage.headObject(rawPath);
  } catch {
    return new NextResponse(headOnly ? null : "Not found", { status: 404 });
  }

  const size = head.bytes;
  const mimeType = head.contentType || shareContext.episode.mimeType || contentTypeForPath(rawPath);
  const wantsDownload = request.nextUrl.searchParams.get("download") === "1";
  const baseHeaders: Record<string, string> = {
    "content-type": mimeType,
    "content-length": String(size),
    "accept-ranges": "bytes"
  };
  if (wantsDownload) {
    baseHeaders["content-disposition"] = attachmentDisposition(rawPath);
  }

  if (headOnly) {
    return new NextResponse(null, {
      status: 200,
      headers: baseHeaders
    });
  }

  const range = request.headers.get("range");
  if (!range) {
    const full = await storage.getObject(rawPath);
    await recordAnalyticsEventBestEffort({
      eventType: "SHARE_PLAYBACK_STARTED",
      userId: shareContext.share.userId,
      itemId: shareContext.item.id,
      sourceType: normalizeSourceType(shareContext.item.sourceType),
      dedupeKey: `share_playback_started:${shareContext.share.id}:${shareContext.episode.id}:${randomUUID()}`,
      metadata: {
        share_id: shareContext.share.id,
        route: SHARE_MEDIA_ROUTE
      }
    });
    return new NextResponse(new Uint8Array(full), {
      status: 200,
      headers: baseHeaders
    });
  }

  const parsedRange = parseRangeHeader(range, size);
  if (!parsedRange) {
    return new NextResponse("Invalid range", {
      status: 416,
      headers: {
        "content-range": `bytes */${size}`
      }
    });
  }

  const { start, end } = parsedRange;
  const chunk = await storage.getObject(rawPath, { start, end });
  if (start <= 1) {
    await recordAnalyticsEventBestEffort({
      eventType: "SHARE_PLAYBACK_STARTED",
      userId: shareContext.share.userId,
      itemId: shareContext.item.id,
      sourceType: normalizeSourceType(shareContext.item.sourceType),
      dedupeKey: `share_playback_started:${shareContext.share.id}:${shareContext.episode.id}:${randomUUID()}`,
      metadata: {
        share_id: shareContext.share.id,
        route: SHARE_MEDIA_ROUTE,
        range_start: start,
        range_end: end
      }
    });
  }
  return new NextResponse(new Uint8Array(chunk), {
    status: 206,
    headers: {
      ...baseHeaders,
      "content-length": String(chunk.byteLength),
      "content-range": `bytes ${start}-${end}/${size}`
    }
  });
}

export async function HEAD(request: NextRequest, context: { params: { path: string[] } }) {
  return handle(request, context, true);
}

export async function GET(request: NextRequest, context: { params: { path: string[] } }) {
  return handle(request, context, false);
}
