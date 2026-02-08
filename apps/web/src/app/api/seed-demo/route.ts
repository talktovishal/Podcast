import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getDashboardItems, getDemoExtractionDiagnostics } from "@/lib/dashboard";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const isDemoUser = user.email.toLowerCase() === env.demoEmail.toLowerCase();
  const [items, extractionDiagnostics] = await Promise.all([
    getDashboardItems(user.id),
    isDemoUser ? getDemoExtractionDiagnostics(user.id) : Promise.resolve([])
  ]);
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
            audioPath: item.episode.audioPath,
            audioBytes: item.episode.audioBytes,
            mimeType: item.episode.mimeType
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

  const existingReady = await prisma.item.findFirst({ where: { userId: user.id, status: "READY" } });
  if (existingReady) {
    return NextResponse.json({ ok: true, seeded: false, reason: "already_exists" });
  }

  return NextResponse.json({ ok: true, seeded: false, reason: "seed handled via script" });
}
