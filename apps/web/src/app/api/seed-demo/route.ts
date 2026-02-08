import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getDashboardItems } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const items = await getDashboardItems(user.id);
  return NextResponse.json({
    ok: true,
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      sourceType: item.sourceType,
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
