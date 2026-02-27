import { hashIncomingToken } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { recordAnalyticsEventBestEffort, resolveUserAnalyticsProfile } from "@/lib/admin-analytics/events";
import { prisma } from "@/lib/prisma";
import { getArtifactStorage } from "@/lib/storage";

function contentTypeForPath(path: string): string {
  if (path.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (path.endsWith(".pdf")) {
    return "application/pdf";
  }
  return "audio/mp4";
}

async function validateToken(feedToken: string | null): Promise<{ userId: string } | null> {
  if (!feedToken) {
    return null;
  }

  const tokenHash = hashIncomingToken(feedToken);
  const found = await prisma.feedToken.findFirst({ where: { tokenHash, active: true }, select: { userId: true } });
  return found ? { userId: found.userId } : null;
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
  const auth = await validateToken(request.nextUrl.searchParams.get("feed_token"));
  if (!auth) {
    return new NextResponse(null, { status: 401 });
  }

  const rawKey = context.params.path.join("/");
  if (rawKey.includes("..")) {
    return new NextResponse(null, { status: 400 });
  }
  const key = rawKey;

  try {
    const storage = getArtifactStorage();
    const head = await storage.headObject(key);

    return new NextResponse(null, {
      status: 200,
      headers: {
        "content-type": head.contentType || contentTypeForPath(key),
        "content-length": String(head.bytes),
        "accept-ranges": "bytes"
      }
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

export async function GET(request: NextRequest, context: { params: { path: string[] } }) {
  const auth = await validateToken(request.nextUrl.searchParams.get("feed_token"));
  if (!auth) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const rawKey = context.params.path.join("/");
  if (rawKey.includes("..")) {
    return new NextResponse("Bad Request", { status: 400 });
  }
  const key = rawKey;

  try {
    const storage = getArtifactStorage();
    const head = await storage.headObject(key);
    const size = head.bytes;
    const mimeType = head.contentType || contentTypeForPath(key);
    const range = request.headers.get("range");
    const now = new Date();
    const maybeEpisodeId = request.nextUrl.searchParams.get("eid");
    const maybeLogPlayback = async (isPlaybackLike: boolean): Promise<void> => {
      if (!isPlaybackLike) {
        return;
      }
      const profile = await resolveUserAnalyticsProfile(auth.userId);
      const dedupeSource = maybeEpisodeId || key;
      let sourceType: "URL" | "PDF" | "HTML_SNAPSHOT" | null = null;
      let itemId: string | null = null;

      if (maybeEpisodeId) {
        const episode = await prisma.episode.findFirst({
          where: {
            id: maybeEpisodeId,
            item: {
              userId: auth.userId
            }
          },
          select: {
            itemId: true,
            item: {
              select: {
                sourceType: true
              }
            }
          }
        });
        itemId = episode?.itemId ?? null;
        const candidate = episode?.item.sourceType;
        if (candidate === "URL" || candidate === "PDF" || candidate === "HTML_SNAPSHOT") {
          sourceType = candidate;
        }
      }

      await recordAnalyticsEventBestEffort({
        eventType: "PLAYBACK_STARTED",
        userId: auth.userId,
        itemId,
        sourceType,
        authMethod: profile.authMethod,
        segmentAuth: profile.segmentAuth,
        userRole: profile.userRole,
        dedupeKey: `playback:${auth.userId}:${dedupeSource}:${now.toISOString().slice(0, 10)}`,
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
    return new NextResponse("Not found", { status: 404 });
  }
}
