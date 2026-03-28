import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { AnalyticsSourceType } from "@articlepod/core";
import { recordAnalyticsEventBestEffort } from "@/lib/admin-analytics/events";
import { env } from "@/lib/env";
import { getPublicEpisodeShareContextById, verifyPublicEpisodeShareSignature } from "@/lib/share-links";

function normalizeSourceType(sourceType: string): AnalyticsSourceType | null {
  return sourceType === "URL" || sourceType === "PDF" || sourceType === "HTML_SNAPSHOT" ? sourceType : null;
}

function destinationForTarget(target: string): string | null {
  if (target === "login") {
    return `${env.appUrl}/login`;
  }
  if (target === "pricing") {
    return `${env.appUrl}/pricing`;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("target") || "";
  const destination = destinationForTarget(target);
  if (!destination) {
    return NextResponse.json({ ok: false, error_code: "INVALID_INPUT", error_message: "Unknown CTA target." }, { status: 400 });
  }

  const shareId = request.nextUrl.searchParams.get("sid") || "";
  const signature = request.nextUrl.searchParams.get("sig") || "";
  if (shareId && signature) {
    const context = await getPublicEpisodeShareContextById(shareId);
    if (
      context &&
      verifyPublicEpisodeShareSignature(
        {
          shareId: context.share.id,
          tokenHash: context.share.tokenHash,
          scope: context.share.scope
        },
        signature
      )
    ) {
      await recordAnalyticsEventBestEffort({
        eventType: "SHARE_CTA_CLICKED",
        userId: context.share.userId,
        itemId: context.item.id,
        sourceType: normalizeSourceType(context.item.sourceType),
        dedupeKey: `share_cta_clicked:${context.share.id}:${target}:${randomUUID()}`,
        metadata: {
          share_id: context.share.id,
          target
        }
      });
    }
  }

  return NextResponse.redirect(destination, { status: 307 });
}
