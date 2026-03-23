import { NextRequest, NextResponse } from "next/server";
import { hashIncomingToken, signStableMediaUrl } from "@articlepod/core";
import { ensureUserFeedToken, getAuthUserFromRequest } from "@/lib/auth";
import { getDashboardItems, getDemoExtractionDiagnostics } from "@/lib/dashboard";
import { env } from "@/lib/env";

export async function GET(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const isDemoUser = user.email.toLowerCase() === env.demoEmail.toLowerCase();
  const [feedToken, items, extractionDiagnostics] = await Promise.all([
    ensureUserFeedToken(user.id),
    getDashboardItems(user.id),
    isDemoUser ? getDemoExtractionDiagnostics(user.id) : Promise.resolve([])
  ]);
  const feedTokenHash = hashIncomingToken(feedToken);
  return NextResponse.json({
    ok: true,
    isDemoUser,
    extractionDiagnostics,
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      status: item.status,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      createdAt: item.createdAt.toISOString(),
      episode: item.episode
        ? {
            id: item.episode.id,
            audioPath: item.episode.audioPath,
            audioBytes: item.episode.audioBytes,
            mimeType: item.episode.mimeType,
            mediaToken: signStableMediaUrl(
              item.episode.audioPath,
              env.mediaSigningKey || item.episode.guid,
              feedTokenHash,
              item.episode.id
            )
          }
        : null
    }))
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const existingReady = (await getDashboardItems(user.id)).find((item) => item.status === "READY");
  if (existingReady) {
    return NextResponse.json({ ok: true, seeded: false, reason: "already_exists" });
  }

  return NextResponse.json({ ok: true, seeded: false, reason: "seed handled via script" });
}
