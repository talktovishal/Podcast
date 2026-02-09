import { rm } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, getAuthUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getArtifactStorage, isLikelyLegacyAbsolutePath } from "@/lib/storage";

export async function DELETE(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const items = await prisma.item.findMany({ where: { userId: user.id }, include: { episode: true } });

  await prisma.user.delete({ where: { id: user.id } });
  const storage = getArtifactStorage();

  for (const item of items) {
    if (item.episode?.audioPath) {
      if (isLikelyLegacyAbsolutePath(item.episode.audioPath)) {
        await rm(item.episode.audioPath, { force: true });
      } else {
        await storage.deleteObject(item.episode.audioPath);
      }
    }
    if (item.sourceFilePath) {
      if (isLikelyLegacyAbsolutePath(item.sourceFilePath)) {
        await rm(item.sourceFilePath, { force: true });
      } else {
        await storage.deleteObject(item.sourceFilePath);
      }
    }
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
