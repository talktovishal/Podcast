import { rm } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, getAuthUserFromRequest } from "@/lib/auth";
import { webPrimaryStore, webUsesAzureTablePrimary } from "@/lib/metadata-primary-store";
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

  const [items, digestRuns, digestEpisodes] =
    webUsesAzureTablePrimary() && webPrimaryStore
      ? await Promise.all([
          (async () => {
            const store = webPrimaryStore;
            const [itemRows, episodes] = await Promise.all([
              store.listItemsByUser(user.id, 500),
              store.listEpisodesForUser(user.id)
            ]);
            const episodesByItemId = new Map(episodes.map((episode) => [episode.itemId, episode]));
            return Promise.all(
              itemRows.map(async (itemRow) => ({
                ...itemRow,
                episode: episodesByItemId.get(itemRow.id) ?? null,
                artifacts: await store.listItemArtifacts(itemRow.id)
              }))
            );
          })(),
          webPrimaryStore.listDigestRunsByUser(user.id, 200),
          webPrimaryStore.listDigestEpisodesForUser(user.id)
        ])
      : await Promise.all([
          prisma.item.findMany({
            where: { userId: user.id },
            include: { episode: true, artifacts: true }
          }),
          prisma.digestRun.findMany({
            where: { userId: user.id },
            select: {
              id: true,
              summaryStorageKey: true,
              emailStorageKey: true
            }
          }),
          prisma.digestEpisode.findMany({
            where: { userId: user.id },
            select: {
              id: true,
              audioPath: true
            }
          })
        ]);

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const store = webPrimaryStore;
    await Promise.all([
      ...items.map((item) =>
        Promise.all([
          store.deleteItem(item.id),
          item.episode ? store.deleteEpisode(item.episode.id) : Promise.resolve(),
          store.deleteItemArtifactsByItemId(item.id),
          store.deleteJobsByItemId(item.id),
          store.deleteChunkCachesByItemId(item.id)
        ])
      ),
      ...digestRuns.map((run) => store.deleteDigestRun(run.id)),
      ...digestEpisodes.map((episode) => store.deleteDigestEpisode(episode.id)),
      store.deleteUser(user.id)
    ]);
  } else {
    await prisma.user.delete({ where: { id: user.id } });
  }
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
