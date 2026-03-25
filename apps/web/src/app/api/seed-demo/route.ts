import { NextRequest, NextResponse } from "next/server";
import { signStableMediaUrl } from "@articlepod/core";
import { ensureUserFeedTokenAccess, getAuthUserFromRequest } from "@/lib/auth";
import { getDashboardItems, getDemoExtractionDiagnostics } from "@/lib/dashboard";
import { env } from "@/lib/env";

export async function GET(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const isDemoUser = user.email.toLowerCase() === env.demoEmail.toLowerCase();
  const [feedAccess, items, extractionDiagnostics] = await Promise.all([
    ensureUserFeedTokenAccess(user.id),
    getDashboardItems(user.id),
    isDemoUser ? getDemoExtractionDiagnostics(user.id) : Promise.resolve([])
  ]);
  const feedTokenHash = feedAccess.tokenHash;
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
      importance: item.importance,
      tags: item.tags,
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
