import { rm } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { deleteQueueProjectionByItemId } from "@/lib/metadata-projection";
import { prisma } from "@/lib/prisma";
import { getArtifactStorage, isLikelyLegacyAbsolutePath } from "@/lib/storage";

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const item = await prisma.item.findUnique({
    where: { id: context.params.id },
    include: { episode: true, artifacts: true, jobs: { select: { id: true } } }
  });
  if (!item || (item.userId !== user.id && user.role !== "ADMIN")) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
  }

  await prisma.item.delete({ where: { id: item.id } });
  await deleteQueueProjectionByItemId(
    item.id,
    item.jobs.map((job) => job.id)
  );

  const storage = getArtifactStorage();

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

  return NextResponse.json({ ok: true });
}
