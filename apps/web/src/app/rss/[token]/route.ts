import { buildRssXml, hashIncomingToken } from "@listenlater/core";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

function normalizeFeedToken(value: string): string {
  return value.replace(/\\.xml$/i, "");
}

export async function GET(request: NextRequest, context: { params: { token: string } }) {
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

  const xml = buildRssXml({
    title: `${feed.user.name || feed.user.email} - ListenLater`,
    description: "Private ListenLater feed",
    link: env.appUrl,
    feedUrl: `${env.appUrl}/rss/${token}.xml`,
    language: "en-us",
    episodes: episodes.map((episode) => ({
      guid: episode.guid,
      title: episode.title,
      description: episode.description,
      pubDate: episode.publishedAt,
      enclosureUrl: `${env.appUrl}/api/media/${episode.audioPath}?feed_token=${token}&eid=${episode.id}`,
      enclosureLength: episode.audioBytes,
      enclosureType: episode.mimeType === "audio/mpeg" ? "audio/mpeg" : "audio/mp4"
    }))
  });

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "private, max-age=60"
    }
  });
}

export async function HEAD(request: NextRequest, context: { params: { token: string } }) {
  const tokenHash = hashIncomingToken(normalizeFeedToken(context.params.token));
  const exists = await prisma.feedToken.findFirst({ where: { tokenHash, active: true }, select: { id: true } });
  return new NextResponse(null, { status: exists ? 200 : 404 });
}
