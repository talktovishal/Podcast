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
  if (user.role === "ADMIN") {
    return NextResponse.json(
      {
        ok: false,
        error_code: "ADMIN_DELETE_FORBIDDEN",
        error_message: "Admin accounts cannot be deleted."
      },
      { status: 403 }
    );
  }

  const [items, digestRuns, digestEpisodes] = await Promise.all([
    prisma.item.findMany({
      where: { userId: user.id },
      include: { episode: true, artifacts: true }
    }),
    prisma.digestRun.findMany({
      where: { userId: user.id },
      select: {
        summaryStorageKey: true,
        emailStorageKey: true
      }
    }),
    prisma.digestEpisode.findMany({
      where: { userId: user.id },
      select: {
        audioPath: true
      }
    })
  ]);

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
    for (const artifact of item.artifacts) {
      await storage.deleteObject(artifact.storageKey).catch(() => undefined);
    }
  }

  for (const run of digestRuns) {
    if (run.summaryStorageKey) {
      await storage.deleteObject(run.summaryStorageKey).catch(() => undefined);
    }
    if (run.emailStorageKey) {
      await storage.deleteObject(run.emailStorageKey).catch(() => undefined);
    }
  }

  for (const episode of digestEpisodes) {
    await storage.deleteObject(episode.audioPath).catch(() => undefined);
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
