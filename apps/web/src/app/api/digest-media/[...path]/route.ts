import { hashIncomingToken } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
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
  const found = await prisma.digestFeedToken.findFirst({ where: { tokenHash, active: true }, select: { userId: true } });
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

async function authorizeDigestEpisode(userId: string, digestEpisodeId: string | null): Promise<boolean> {
  if (!digestEpisodeId) {
    return true;
  }

  const episode = await prisma.digestEpisode.findFirst({
    where: {
      id: digestEpisodeId,
      userId
    },
    select: {
      id: true
    }
  });
  return Boolean(episode);
}

export async function HEAD(request: NextRequest, context: { params: { path: string[] } }) {
  const auth = await validateToken(request.nextUrl.searchParams.get("digest_feed_token"));
  if (!auth) {
    return new NextResponse(null, { status: 401 });
  }

  const digestEpisodeId = request.nextUrl.searchParams.get("deid");
  if (!(await authorizeDigestEpisode(auth.userId, digestEpisodeId))) {
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
  const auth = await validateToken(request.nextUrl.searchParams.get("digest_feed_token"));
  if (!auth) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const digestEpisodeId = request.nextUrl.searchParams.get("deid");
  if (!(await authorizeDigestEpisode(auth.userId, digestEpisodeId))) {
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

    if (!range) {
      const full = await storage.getObject(key);
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
