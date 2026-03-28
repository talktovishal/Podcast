import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { AnalyticsSourceType } from "@articlepod/core";
import { recordAnalyticsEventBestEffort } from "@/lib/admin-analytics/events";
import { contentTypeForPath, parseRangeHeader } from "@/lib/media-utils";
import { getArtifactStorage } from "@/lib/storage";
import {
  getPublicEpisodeShareContextById,
  verifyPublicEpisodeMediaToken
} from "@/lib/share-links";

const SHARE_MEDIA_ROUTE = "/api/share-media/[...path]";

function normalizeSourceType(sourceType: string): AnalyticsSourceType | null {
  return sourceType === "URL" || sourceType === "PDF" || sourceType === "HTML_SNAPSHOT" ? sourceType : null;
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
