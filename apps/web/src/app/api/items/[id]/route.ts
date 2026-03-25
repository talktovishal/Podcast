import { rm } from "node:fs/promises";
import { parseStoredItemTags, serializeItemTags, updateItemMetadataSchema } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { fromError } from "@/lib/http";
import { getAuthUserFromRequest } from "@/lib/auth";
import { deleteQueueProjectionByItemId } from "@/lib/metadata-projection";
import { webPrimaryStore, webUsesAzureTablePrimary } from "@/lib/metadata-primary-store";
import { prisma } from "@/lib/prisma";
import { getArtifactStorage, isLikelyLegacyAbsolutePath } from "@/lib/storage";

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const item =
    webUsesAzureTablePrimary() && webPrimaryStore
      ? await (async () => {
          const [itemRow, episode, artifacts, jobs] = await Promise.all([
            webPrimaryStore.findItemById(context.params.id),
            webPrimaryStore.findEpisodeByItemId(context.params.id),
            webPrimaryStore.listItemArtifacts(context.params.id),
            webPrimaryStore.listJobsByItemId(context.params.id)
          ]);
          return itemRow
            ? {
                ...itemRow,
                episode,
                artifacts,
                jobs
              }
            : null;
        })()
      : await prisma.item.findUnique({
          where: { id: context.params.id },
          include: { episode: true, artifacts: true, jobs: { select: { id: true } } }
        });
  if (!item || (item.userId !== user.id && user.role !== "ADMIN")) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
  }

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    await Promise.all([
      webPrimaryStore.deleteItem(item.id),
      item.episode ? webPrimaryStore.deleteEpisode(item.episode.id) : Promise.resolve(),
      webPrimaryStore.deleteItemArtifactsByItemId(item.id),
      webPrimaryStore.deleteJobsByItemId(item.id),
      webPrimaryStore.deleteChunkCachesByItemId(item.id)
    ]);
  } else {
    await prisma.item.delete({ where: { id: item.id } });
  }
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

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const { importance, tags } = updateItemMetadataSchema.parse(await request.json());

    const item = webUsesAzureTablePrimary() && webPrimaryStore
      ? await webPrimaryStore.findItemById(context.params.id)
      : await prisma.item.findUnique({ where: { id: context.params.id } });

    if (!item || (item.userId !== user.id && user.role !== "ADMIN")) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
    }

    if (webUsesAzureTablePrimary() && webPrimaryStore) {
      await webPrimaryStore.updateItem(context.params.id, {
        ...(importance !== undefined ? { priority: importance } : {}),
        ...(tags !== undefined ? { tags } : {})
      });
    } else {
      await prisma.item.update({
        where: { id: context.params.id },
        data: {
          ...(importance !== undefined ? { priority: importance } : {}),
          ...(tags !== undefined ? { tagsJson: serializeItemTags(tags) } : {})
        }
      });
    }

    return NextResponse.json({
      ok: true,
      importance: importance ?? item.priority,
      tags:
        tags ??
        ("tags" in item && Array.isArray(item.tags)
          ? item.tags
          : "tagsJson" in item
            ? parseStoredItemTags(item.tagsJson)
            : [])
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/items/[id]"
    });
  }
}
