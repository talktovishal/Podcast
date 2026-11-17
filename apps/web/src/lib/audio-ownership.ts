import { rm } from "node:fs/promises";
import { deriveAlternateAudioPath } from "@articlepod/core";
import { webPrimaryStore, webUsesAzureTablePrimary } from "./metadata-primary-store";
import { prisma } from "./prisma";
import { getArtifactStorage, isLikelyLegacyAbsolutePath } from "./storage";

export async function hasAudioReferences(path: string): Promise<boolean> {
  const alternate = deriveAlternateAudioPath(path);
  const paths = alternate ? [path, alternate] : [path];
  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    return webPrimaryStore.hasAudioReferences(paths);
  }
  const where = { audioPath: { in: paths } };
  const references = await Promise.all([
    prisma.episode.findFirst({ where, select: { id: true } }),
    prisma.digestEpisode.findFirst({ where, select: { id: true } }),
    prisma.summaryEpisode.findFirst({ where, select: { id: true } })
  ]);
  return references.some(Boolean);
}

// Call after removing departing metadata. New workers never publish shared paths;
// checking alternate formats also covers concurrent legacy RSS media repair.
export async function deleteUnreferencedAudioObject(path: string): Promise<boolean> {
  if (await hasAudioReferences(path)) {
    return false;
  }
  if (isLikelyLegacyAbsolutePath(path)) {
    await rm(path, { force: true });
  } else {
    await getArtifactStorage().deleteObject(path);
  }
  return true;
}

export async function purgeExpiredItemArtifacts(now = new Date()): Promise<number> {
  const store = webUsesAzureTablePrimary() ? webPrimaryStore : null;
  const artifacts = store
    ? await store.listExpiredItemArtifacts(now)
    : await prisma.itemArtifact.findMany({ where: { expiresAt: { lte: now } }, take: 1000 });
  let removed = 0;
  for (const artifact of artifacts) {
    if (!await deleteUnreferencedAudioObject(artifact.storageKey)) {
      continue;
    }
    // Keep the record on storage failure so the next purge can retry.
    if (store) {
      await store.deleteItemArtifact(artifact.itemId, artifact.kind);
    } else {
      await prisma.itemArtifact.deleteMany({ where: { id: artifact.id } });
    }
    removed += 1;
  }
  return removed;
}
