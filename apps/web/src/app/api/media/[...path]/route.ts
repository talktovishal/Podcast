import { hashIncomingToken } from "@listenlater/core";
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

async function validateToken(feedToken: string | null): Promise<boolean> {
  if (!feedToken) {
    return false;
  }

  const tokenHash = hashIncomingToken(feedToken);
  const found = await prisma.feedToken.findFirst({ where: { tokenHash, active: true }, select: { id: true } });
  return Boolean(found);
}

function parseRangeHeader(range: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    return null;
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
}

export async function HEAD(request: NextRequest, context: { params: { path: string[] } }) {
  const valid = await validateToken(request.nextUrl.searchParams.get("feed_token"));
  if (!valid) {
    return new NextResponse(null, { status: 401 });
  }

  const key = context.params.path.join("/");

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
  const valid = await validateToken(request.nextUrl.searchParams.get("feed_token"));
  if (!valid) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const key = context.params.path.join("/");

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
