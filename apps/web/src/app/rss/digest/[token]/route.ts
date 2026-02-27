import { buildRssXml, hashIncomingToken } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { BRAND_NAME } from "@articlepod/core/src/config/brand";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

function normalizeFeedToken(value: string): string {
  return value.replace(/\.xml$/i, "");
}

export async function GET(request: NextRequest, context: { params: { token: string } }) {
  const token = normalizeFeedToken(context.params.token);
  const tokenHash = hashIncomingToken(token);
  const feed = await prisma.digestFeedToken.findFirst({
    where: {
      tokenHash,
      active: true
    },
    include: {
      user: true
    }
  });

  if (!feed) {
    return new NextResponse("Digest feed not found", { status: 404 });
  }

  const episodes = await prisma.digestEpisode.findMany({
    where: {
      userId: feed.userId
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }]
  });

  const xml = buildRssXml({
    title: `${feed.user.name || feed.user.email} - ${BRAND_NAME} Digest`,
    description: `Private ${BRAND_NAME} daily/weekly digest feed`,
    link: env.appUrl,
    feedUrl: `${env.appUrl}/rss/digest/${token}.xml`,
    language: "en-us",
    episodes: episodes.map((episode) => ({
      guid: episode.guid,
      title: episode.title,
      description: episode.description,
      pubDate: episode.publishedAt,
      enclosureUrl: `${env.appUrl}/api/digest-media/${episode.audioPath}?digest_feed_token=${token}&deid=${episode.id}`,
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
  const exists = await prisma.digestFeedToken.findFirst({ where: { tokenHash, active: true }, select: { id: true } });
  return new NextResponse(null, { status: exists ? 200 : 404 });
}
