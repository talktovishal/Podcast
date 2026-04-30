import { rm } from "node:fs/promises";
import { buildUserWikiBuildStateStorageKey, buildUserWikiManifestStorageKey } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, getAuthUserFromRequest } from "@/lib/auth";
import { webPrimaryStore, webUsesAzureTablePrimary } from "@/lib/metadata-primary-store";
import { prisma } from "@/lib/prisma";
import { getArtifactStorage, isLikelyLegacyAbsolutePath } from "@/lib/storage";
import { getUserWikiManifestForApp } from "@/lib/wiki";

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

  const wikiManifest = await getUserWikiManifestForApp(user.id);

  const [items, snippets, digestRuns, digestEpisodes, summaryRuns, summaryEpisodes] =
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
          webPrimaryStore.listSnippetsByUser(user.id, 500),
          webPrimaryStore.listDigestRunsByUser(user.id, 200),
          webPrimaryStore.listDigestEpisodesForUser(user.id),
          webPrimaryStore.listSummaryRunsByUser(user.id, 200),
          webPrimaryStore.listSummaryEpisodesForUser(user.id)
        ])
      : await Promise.all([
          prisma.item.findMany({
            where: { userId: user.id },
            include: { episode: true, artifacts: true }
          }),
          prisma.snippet.findMany({
            where: { userId: user.id },
            select: {
              id: true
            }
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
          }),
          prisma.summaryRun.findMany({
            where: { userId: user.id },
            select: {
              id: true,
              summaryStorageKey: true
            }
          }),
          prisma.summaryEpisode.findMany({
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
          store.deleteArticleSummaryTasksByItemId(item.id),
          store.deleteChunkCachesByItemId(item.id)
        ])
      ),
      ...snippets.map((snippet) => store.deleteSnippet(snippet.id)),
      ...digestRuns.map((run) => store.deleteDigestRun(run.id)),
      ...digestEpisodes.map((episode) => store.deleteDigestEpisode(episode.id)),
      ...summaryRuns.map((run) => Promise.all([store.deleteSummaryRunItemsByRunId(run.id), store.deleteSummaryRun(run.id)])),
      ...summaryEpisodes.map((episode) => store.deleteSummaryEpisode(episode.id)),
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
    if (item.summaryStorageKey) {
      await storage.deleteObject(item.summaryStorageKey).catch(() => undefined);
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

  for (const run of summaryRuns) {
    if (run.summaryStorageKey) {
      await storage.deleteObject(run.summaryStorageKey).catch(() => undefined);
    }
  }

  for (const episode of summaryEpisodes) {
    await storage.deleteObject(episode.audioPath).catch(() => undefined);
  }

  if (wikiManifest) {
    for (const page of wikiManifest.pages) {
      await storage.deleteObject(page.storageKey).catch(() => undefined);
    }
    await storage.deleteObject(buildUserWikiManifestStorageKey(user.id)).catch(() => undefined);
    await storage.deleteObject(buildUserWikiBuildStateStorageKey(user.id, wikiManifest.buildRunId)).catch(() => undefined);
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
