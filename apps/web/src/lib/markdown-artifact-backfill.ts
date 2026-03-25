import { randomUUID } from "node:crypto";
import {
  type AzureTablePrimaryItem,
  chunkText,
  cleanExtractedMarkdown,
  errorCodes,
  hasNarratableText,
  lowSignalExtractionMessage,
  markdownToNarrationText,
  normalizeTtsSelection,
  sha256
} from "@articlepod/core";
import { webPrimaryStore, webUsesAzureTablePrimary } from "./metadata-primary-store";
import { syncQueueProjectionFromEnqueue } from "./metadata-projection";
import { prisma } from "./prisma";
import { getArtifactStorage } from "./storage";

const PAGE_SIZE = 100;

type BackfillItemRecord = {
  id: string;
  userId: string;
  status: string;
  textHash: string | null;
  markdownArtifact: {
    id: string;
    storageKey: string;
    byteLength: number;
    createdAt: Date;
  } | null;
  episode: {
    id: string;
  } | null;
  jobs: Array<{
    id: string;
    status: string;
    attempt?: number;
    createdAt?: Date;
    updatedAt?: Date;
    lockedAt?: Date | null;
    nextRetryAt?: Date | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }>;
  user: {
    id: string;
    ttsProvider: string | null;
    ttsVoice: string | null;
  } | null;
  createdAt?: Date;
  updatedAt?: Date;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type MarkdownArtifactBackfillOptions = {
  dryRun?: boolean;
  limit?: number;
  itemIds?: string[];
};

export type MarkdownArtifactBackfillSummary = {
  dryRun: boolean;
  scanned: number;
  updatedArtifacts: number;
  unchangedArtifacts: number;
  regenerationQueued: number;
  failedLowSignal: number;
  skippedPublishedLowSignal: number;
  skippedActive: number;
  skippedNoMarkdown: number;
};

function ttsChunkMaxChars(): number {
  const parsed = Number(process.env.WORKER_TTS_CHUNK_MAX_CHARS ?? 1800);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1800;
}

function hasActiveJob(item: BackfillItemRecord): boolean {
  return item.status === "PROCESSING" || item.jobs.some((job) => job.status === "QUEUED" || job.status === "PROCESSING");
}

function computeNarrationHash(input: {
  userId: string;
  ttsProvider: string | null;
  ttsVoice: string | null;
  markdown: string;
}): { narrationText: string; cacheKey: string | null } {
  const narrationText = markdownToNarrationText(input.markdown);
  if (!hasNarratableText(narrationText)) {
    return { narrationText, cacheKey: null };
  }

  const chunks = chunkText(narrationText, ttsChunkMaxChars());
  if (chunks.length === 0) {
    return { narrationText, cacheKey: null };
  }

  const selection = normalizeTtsSelection({
    providerId: input.ttsProvider,
    voice: input.ttsVoice
  });
  const cacheKey = sha256([input.userId, selection.providerId, selection.voice, ...chunks.map((chunk) => chunk.hash)].join("|"));
  return { narrationText, cacheKey };
}

async function loadPrismaItems(cursor?: string, limit = PAGE_SIZE): Promise<BackfillItemRecord[]> {
  const items = await prisma.item.findMany({
    where: cursor
      ? {
          id: {
            gt: cursor
          }
        }
      : undefined,
    orderBy: {
      id: "asc"
    },
    take: limit,
    select: {
      id: true,
      userId: true,
      status: true,
      textHash: true,
      createdAt: true,
      updatedAt: true,
      errorCode: true,
      errorMessage: true,
      user: {
        select: {
          id: true,
          ttsProvider: true,
          ttsVoice: true
        }
      },
      episode: {
        select: {
          id: true
        }
      },
      jobs: {
        select: {
          id: true,
          status: true,
          attempt: true,
          createdAt: true,
          updatedAt: true,
          lockedAt: true,
          nextRetryAt: true,
          errorCode: true,
          errorMessage: true
        },
        orderBy: {
          createdAt: "desc"
        }
      },
      artifacts: {
        where: {
          kind: "MARKDOWN"
        },
        select: {
          id: true,
          storageKey: true,
          byteLength: true,
          createdAt: true
        },
        take: 1
      }
    }
  });

  return items.map((item) => ({
    id: item.id,
    userId: item.userId,
    status: item.status,
    textHash: item.textHash,
    markdownArtifact: item.artifacts[0] ?? null,
    episode: item.episode,
    jobs: item.jobs,
    user: item.user,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    errorCode: item.errorCode,
    errorMessage: item.errorMessage
  }));
}

async function loadPrismaItemsById(itemIds: string[]): Promise<BackfillItemRecord[]> {
  const items = await prisma.item.findMany({
    where: {
      id: {
        in: itemIds
      }
    },
    orderBy: {
      id: "asc"
    },
    select: {
      id: true,
      userId: true,
      status: true,
      textHash: true,
      createdAt: true,
      updatedAt: true,
      errorCode: true,
      errorMessage: true,
      user: {
        select: {
          id: true,
          ttsProvider: true,
          ttsVoice: true
        }
      },
      episode: {
        select: {
          id: true
        }
      },
      jobs: {
        select: {
          id: true,
          status: true,
          attempt: true,
          createdAt: true,
          updatedAt: true,
          lockedAt: true,
          nextRetryAt: true,
          errorCode: true,
          errorMessage: true
        },
        orderBy: {
          createdAt: "desc"
        }
      },
      artifacts: {
        where: {
          kind: "MARKDOWN"
        },
        select: {
          id: true,
          storageKey: true,
          byteLength: true,
          createdAt: true
        },
        take: 1
      }
    }
  });

  return items.map((item) => ({
    id: item.id,
    userId: item.userId,
    status: item.status,
    textHash: item.textHash,
    markdownArtifact: item.artifacts[0] ?? null,
    episode: item.episode,
    jobs: item.jobs,
    user: item.user,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    errorCode: item.errorCode,
    errorMessage: item.errorMessage
  }));
}

async function hydratePrimaryItemRecord(
  primaryStore: NonNullable<typeof webPrimaryStore>,
  item: AzureTablePrimaryItem
): Promise<BackfillItemRecord> {
  const [user, episode, jobs, artifacts] = await Promise.all([
    primaryStore.findUserById(item.userId),
    primaryStore.findEpisodeByItemId(item.id),
    primaryStore.listJobsByItemId(item.id),
    primaryStore.listItemArtifacts(item.id, "MARKDOWN")
  ]);

  return {
    id: item.id,
    userId: item.userId,
    status: item.status,
    textHash: item.textHash,
    markdownArtifact:
      artifacts[0] === undefined
        ? null
        : {
            id: artifacts[0].id,
            storageKey: artifacts[0].storageKey,
            byteLength: artifacts[0].byteLength,
            createdAt: artifacts[0].createdAt
          },
    episode: episode ? { id: episode.id } : null,
    jobs: jobs.map((job) => ({
      id: job.id,
      status: job.status,
      attempt: job.attempt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      lockedAt: job.lockedAt,
      nextRetryAt: job.nextRetryAt,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage
    })),
    user: user
      ? {
          id: user.id,
          ttsProvider: user.ttsProvider,
          ttsVoice: user.ttsVoice
        }
      : null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    errorCode: item.errorCode,
    errorMessage: item.errorMessage
  };
}

async function loadPrimaryItems(cursor?: string, limit = PAGE_SIZE): Promise<BackfillItemRecord[]> {
  const primaryStore = webPrimaryStore;
  if (!webUsesAzureTablePrimary() || !primaryStore) {
    return [];
  }

  const items = await primaryStore.listItemsPage(cursor, limit);
  return Promise.all(items.map((item) => hydratePrimaryItemRecord(primaryStore, item)));
}

async function loadPrimaryItemsById(itemIds: string[]): Promise<BackfillItemRecord[]> {
  const primaryStore = webPrimaryStore;
  if (!webUsesAzureTablePrimary() || !primaryStore) {
    return [];
  }

  const rows: BackfillItemRecord[] = [];
  for (const itemId of itemIds) {
    const item = await primaryStore.findItemById(itemId);
    if (!item) {
      continue;
    }
    rows.push(await hydratePrimaryItemRecord(primaryStore, item));
  }
  return rows;
}

async function updateMarkdownArtifact(
  item: BackfillItemRecord,
  cleanedMarkdown: string,
  dryRun: boolean
): Promise<{ changed: boolean; byteLength: number }> {
  const artifact = item.markdownArtifact;
  if (!artifact) {
    return { changed: false, byteLength: 0 };
  }

  const byteLength = Buffer.byteLength(cleanedMarkdown, "utf8");
  const storage = getArtifactStorage();
  const currentMarkdown = (await storage.getObject(artifact.storageKey)).toString("utf8");
  const changed = currentMarkdown !== cleanedMarkdown;
  if (!changed || dryRun) {
    return { changed, byteLength };
  }

  await storage.putObject(artifact.storageKey, Buffer.from(cleanedMarkdown, "utf8"), {
    contentType: "text/markdown; charset=utf-8"
  });

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const primaryStore = webPrimaryStore;
    await primaryStore.upsertItemArtifact({
      id: artifact.id,
      itemId: item.id,
      kind: "MARKDOWN",
      storageKey: artifact.storageKey,
      contentType: "text/markdown; charset=utf-8",
      byteLength,
      expiresAt: null,
      createdAt: artifact.createdAt
    });
  } else {
    await prisma.itemArtifact.update({
      where: {
        id: artifact.id
      },
      data: {
        byteLength,
        contentType: "text/markdown; charset=utf-8",
        storageKey: artifact.storageKey,
        expiresAt: null
      }
    });
  }

  return { changed, byteLength };
}

async function markLowSignalFailure(item: BackfillItemRecord, dryRun: boolean): Promise<void> {
  if (dryRun) {
    return;
  }

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const primaryStore = webPrimaryStore;
    await primaryStore.deleteChunkCachesByItemId(item.id);
    await primaryStore.updateItem(item.id, {
      status: "FAILED",
      errorCode: errorCodes.EXTRACTION_EMPTY,
      errorMessage: lowSignalExtractionMessage,
      textHash: null
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.chunkCache.deleteMany({
      where: {
        itemId: item.id
      }
    });
    await tx.item.update({
      where: {
        id: item.id
      },
      data: {
        status: "FAILED",
        errorCode: errorCodes.EXTRACTION_EMPTY,
        errorMessage: lowSignalExtractionMessage,
        textHash: null
      }
    });
  });
}

async function queueRegeneration(item: BackfillItemRecord, dryRun: boolean): Promise<void> {
  if (dryRun) {
    return;
  }

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const primaryStore = webPrimaryStore;
    await primaryStore.deleteChunkCachesByItemId(item.id);
    await primaryStore.updateItem(item.id, {
      status: "QUEUED",
      errorCode: null,
      errorMessage: null
    });
    await primaryStore.createJob({
      id: randomUUID(),
      itemId: item.id,
      userId: item.userId,
      status: "QUEUED"
    });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.chunkCache.deleteMany({
      where: {
        itemId: item.id
      }
    });

    const updatedItem = await tx.item.update({
      where: {
        id: item.id
      },
      data: {
        status: "QUEUED",
        errorCode: null,
        errorMessage: null
      },
      select: {
        id: true,
        userId: true,
        sourceType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        errorCode: true,
        errorMessage: true
      }
    });

    const createdJob = await tx.job.create({
      data: {
        itemId: item.id,
        status: "QUEUED"
      },
      select: {
        id: true,
        itemId: true,
        status: true,
        attempt: true,
        createdAt: true,
        updatedAt: true,
        lockedAt: true,
        nextRetryAt: true,
        errorCode: true,
        errorMessage: true
      }
    });

    return {
      item: updatedItem,
      job: createdJob
    };
  });

  await syncQueueProjectionFromEnqueue(result);
}

async function loadPage(cursor?: string, limit = PAGE_SIZE): Promise<BackfillItemRecord[]> {
  return webUsesAzureTablePrimary() && webPrimaryStore ? loadPrimaryItems(cursor, limit) : loadPrismaItems(cursor, limit);
}

async function loadSpecificItems(itemIds: string[]): Promise<BackfillItemRecord[]> {
  return webUsesAzureTablePrimary() && webPrimaryStore ? loadPrimaryItemsById(itemIds) : loadPrismaItemsById(itemIds);
}

export async function backfillCleanedMarkdownArtifacts(
  options: MarkdownArtifactBackfillOptions = {}
): Promise<MarkdownArtifactBackfillSummary> {
  const dryRun = options.dryRun ?? false;
  const limit = options.limit && options.limit > 0 ? options.limit : Number.POSITIVE_INFINITY;
  const summary: MarkdownArtifactBackfillSummary = {
    dryRun,
    scanned: 0,
    updatedArtifacts: 0,
    unchangedArtifacts: 0,
    regenerationQueued: 0,
    failedLowSignal: 0,
    skippedPublishedLowSignal: 0,
    skippedActive: 0,
    skippedNoMarkdown: 0
  };

  const storage = getArtifactStorage();
  let cursor: string | undefined;
  const targetedItemIds = options.itemIds?.filter(Boolean);

  if (targetedItemIds && targetedItemIds.length > 0) {
    const targetedItems = await loadSpecificItems(targetedItemIds);
    for (const item of targetedItems) {
      if (summary.scanned >= limit) {
        break;
      }

      summary.scanned += 1;

      if (!item.markdownArtifact || !item.user) {
        summary.skippedNoMarkdown += 1;
        continue;
      }

      if (hasActiveJob(item)) {
        summary.skippedActive += 1;
        continue;
      }

      const currentMarkdown = (await storage.getObject(item.markdownArtifact.storageKey)).toString("utf8");
      const cleanedMarkdown = cleanExtractedMarkdown(currentMarkdown);
      const { changed } = await updateMarkdownArtifact(item, cleanedMarkdown, dryRun);
      if (changed) {
        summary.updatedArtifacts += 1;
      } else {
        summary.unchangedArtifacts += 1;
      }

      const { cacheKey } = computeNarrationHash({
        userId: item.user.id,
        ttsProvider: item.user.ttsProvider,
        ttsVoice: item.user.ttsVoice,
        markdown: cleanedMarkdown
      });

      if (!cacheKey) {
        if (item.episode) {
          summary.skippedPublishedLowSignal += 1;
          continue;
        }

        summary.failedLowSignal += 1;
        await markLowSignalFailure(item, dryRun);
        continue;
      }

      if (cacheKey === item.textHash) {
        continue;
      }

      summary.regenerationQueued += 1;
      await queueRegeneration(item, dryRun);
    }

    return summary;
  }

  while (summary.scanned < limit) {
    const remaining = Number.isFinite(limit) ? Math.max(0, limit - summary.scanned) : PAGE_SIZE;
    const page = await loadPage(cursor, Math.min(PAGE_SIZE, remaining || PAGE_SIZE));
    if (page.length === 0) {
      break;
    }

    for (const item of page) {
      if (summary.scanned >= limit) {
        break;
      }
      summary.scanned += 1;
      cursor = item.id;

      if (!item.markdownArtifact || !item.user) {
        summary.skippedNoMarkdown += 1;
        continue;
      }

      if (hasActiveJob(item)) {
        summary.skippedActive += 1;
        continue;
      }

      const currentMarkdown = (await storage.getObject(item.markdownArtifact.storageKey)).toString("utf8");
      const cleanedMarkdown = cleanExtractedMarkdown(currentMarkdown);
      const { changed } = await updateMarkdownArtifact(item, cleanedMarkdown, dryRun);
      if (changed) {
        summary.updatedArtifacts += 1;
      } else {
        summary.unchangedArtifacts += 1;
      }

      const { cacheKey } = computeNarrationHash({
        userId: item.user.id,
        ttsProvider: item.user.ttsProvider,
        ttsVoice: item.user.ttsVoice,
        markdown: cleanedMarkdown
      });

      if (!cacheKey) {
        if (item.episode) {
          summary.skippedPublishedLowSignal += 1;
          continue;
        }

        summary.failedLowSignal += 1;
        await markLowSignalFailure(item, dryRun);
        continue;
      }

      if (cacheKey === item.textHash) {
        continue;
      }

      summary.regenerationQueued += 1;
      await queueRegeneration(item, dryRun);
    }
  }

  return summary;
}
