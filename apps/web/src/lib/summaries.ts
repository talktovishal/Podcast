import { randomUUID } from "node:crypto";
import {
  AppError,
  errorCodes,
  parseStoredItemTags,
  toSummaryPodcastUserMessage,
  toSummaryRunUserMessage,
  type CreateSummaryRunInput
} from "@articlepod/core";
import { prisma } from "./prisma";
import { webPrimaryStore, webUsesAzureTablePrimary } from "./metadata-primary-store";
import { getArtifactStorage } from "./storage";
import { filterUnexpiredAudioEpisodes, isAudioAvailable } from "./audio-retention";
import { consumeSummaryRunAllowance } from "./summary-usage";

const DEFAULT_SUMMARY_ITEM_LIMIT = 200;
const DEFAULT_SUMMARY_RUN_LIMIT = 20;
const DEFAULT_SELECTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DEFAULT_SELECTION_COUNT = 30;
const DEFAULT_ITEM_PRIORITY = "LOW";

export type SelectableSummaryItem = {
  id: string;
  title: string | null;
  sourceType: string;
  sourceUrl: string | null;
  importance: string;
  tags: string[];
  createdAt: Date;
  defaultSelected: boolean;
};

export type SummaryRunListEntry = {
  id: string;
  userId: string;
  requestedTitle: string | null;
  title: string | null;
  status: string;
  attempt: number;
  windowStart: Date;
  windowEnd: Date;
  targetLengthMinutes: number;
  selectedItemCount: number;
  podcastEnabled: boolean;
  podcastStatus: string | null;
  podcastError: string | null;
  summaryStorageKey: string | null;
  summaryBytes: number | null;
  summaryProvider: string | null;
  summaryModel: string | null;
  summaryDeployment: string | null;
  summaryInputTokens: number | null;
  summaryOutputTokens: number | null;
  fallbackUsed: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  episode:
    | {
        id: string;
        audioPath: string;
        audioBytes: number;
        mimeType: string;
        publishedAt: Date;
      }
    | null;
};

function toUserFacingSummaryRun(run: SummaryRunListEntry): SummaryRunListEntry {
  return {
    ...run,
    podcastError: toSummaryPodcastUserMessage(run.podcastError),
    errorMessage: toSummaryRunUserMessage(run.errorMessage, run.errorCode)
  };
}

function isSupportedSummarySourceType(sourceType: string): boolean {
  return sourceType === "URL" || sourceType === "PDF" || sourceType === "HTML_SNAPSHOT";
}

function compareNewestFirst<T extends { createdAt: Date; id: string }>(a: T, b: T): number {
  return b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id);
}

function applyDefaultSelection(items: Array<Omit<SelectableSummaryItem, "defaultSelected">>): SelectableSummaryItem[] {
  const cutoff = Date.now() - DEFAULT_SELECTION_WINDOW_MS;
  let selectedCount = 0;

  return items.map((item) => {
    const withinDefaultWindow = item.createdAt.getTime() >= cutoff;
    const defaultSelected = withinDefaultWindow && selectedCount < MAX_DEFAULT_SELECTION_COUNT;
    if (defaultSelected) {
      selectedCount += 1;
    }
    return {
      ...item,
      defaultSelected
    };
  });
}

export async function listSelectableSummaryItems(
  userId: string,
  input?: { limit?: number; search?: string }
): Promise<SelectableSummaryItem[]> {
  const limit = Math.max(1, Math.min(input?.limit ?? DEFAULT_SUMMARY_ITEM_LIMIT, 500));
  const search = input?.search?.trim().toLowerCase() || "";

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const store = webPrimaryStore;
    const items = await store.listItemsByUser(userId, Math.max(limit, 500));
    const readyItems = items
      .filter((item) => item.status === "READY" && isSupportedSummarySourceType(item.sourceType))
      .sort(compareNewestFirst);

    const hydrated = await Promise.all(
      readyItems.map(async (item) => ({
        item,
        artifacts: await store.listItemArtifacts(item.id, "MARKDOWN")
      }))
    );

    const filtered = hydrated
      .filter((entry) => entry.artifacts.length > 0)
      .map(({ item }) => ({
        id: item.id,
        title: item.title,
        sourceType: item.sourceType,
        sourceUrl: item.sourceUrl,
        importance: item.priority ?? DEFAULT_ITEM_PRIORITY,
        tags: item.tags ?? [],
        createdAt: item.createdAt
      }))
      .filter((item) => {
        if (!search) {
          return true;
        }
        return [item.title || "", item.sourceUrl || "", item.sourceType].some((value) => value.toLowerCase().includes(search));
      })
      .slice(0, limit);

    return applyDefaultSelection(filtered);
  }

  const items = await prisma.item.findMany({
    where: {
      userId,
      status: "READY",
      sourceType: {
        in: ["URL", "PDF", "HTML_SNAPSHOT"]
      }
    },
    include: {
      artifacts: {
        where: { kind: "MARKDOWN" },
        take: 1
      }
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: Math.max(limit, 500)
  });

  const filtered = items
    .filter((item) => item.artifacts.length > 0)
    .filter((item) => {
      if (!search) {
        return true;
      }
      return [item.title || "", item.sourceUrl || "", item.sourceType].some((value) => value.toLowerCase().includes(search));
    })
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      title: item.title,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      importance: item.priority ?? DEFAULT_ITEM_PRIORITY,
      tags: parseStoredItemTags(item.tagsJson),
      createdAt: item.createdAt
    }));

  return applyDefaultSelection(filtered);
}

export async function createSummaryRunForUser(userId: string, input: CreateSummaryRunInput): Promise<SummaryRunListEntry> {
  await consumeSummaryRunAllowance(userId);

  const dedupedItemIds = Array.from(new Set(input.itemIds.map((value) => value.trim()).filter(Boolean)));
  if (dedupedItemIds.length === 0) {
    throw new AppError(errorCodes.INVALID_INPUT, "Choose at least one saved article to summarize.", 400);
  }
  if (dedupedItemIds.length > 30) {
    throw new AppError(errorCodes.INVALID_INPUT, "Choose 30 saved articles or fewer for one summary.", 400);
  }

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const store = webPrimaryStore;
    const hydrated = await Promise.all(
      dedupedItemIds.map(async (itemId) => {
        const item = await store.findItemById(itemId);
        if (!item || item.userId !== userId || item.status !== "READY" || !isSupportedSummarySourceType(item.sourceType)) {
          return null;
        }
        const artifacts = await store.listItemArtifacts(item.id, "MARKDOWN");
        if (artifacts.length === 0) {
          return null;
        }
        return item;
      })
    );

    const selectedItems = hydrated.filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (selectedItems.length !== dedupedItemIds.length) {
      throw new AppError(errorCodes.INVALID_INPUT, "Some selected articles are no longer ready for summary generation.", 400);
    }

    const createdAt = new Date();
    const orderedItems = dedupedItemIds
      .map((itemId) => selectedItems.find((item) => item.id === itemId) || null)
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const createdRun = await store.createSummaryRun({
      id: randomUUID(),
      userId,
      requestedTitle: input.requestedTitle?.trim() || null,
      windowStart: new Date(Math.min(...orderedItems.map((item) => item.createdAt.getTime()))),
      windowEnd: new Date(Math.max(...orderedItems.map((item) => item.createdAt.getTime()))),
      status: "QUEUED",
      targetLengthMinutes: input.targetLengthMinutes,
      selectedItemCount: orderedItems.length,
      podcastEnabled: input.podcastEnabled ?? true,
      createdAt
    });

    await Promise.all(
      orderedItems.map((item, index) =>
        store.createSummaryRunItem({
          id: randomUUID(),
          summaryRunId: createdRun.id,
          itemId: item.id,
          orderIndex: index,
          createdAt
        })
      )
    );

    return {
      ...createdRun,
      episode: null
    };
  }

  const items = await prisma.item.findMany({
    where: {
      id: { in: dedupedItemIds },
      userId,
      status: "READY",
      sourceType: {
        in: ["URL", "PDF", "HTML_SNAPSHOT"]
      }
    },
    include: {
      artifacts: {
        where: { kind: "MARKDOWN" },
        take: 1
      }
    }
  });

  if (items.length !== dedupedItemIds.length || items.some((item) => item.artifacts.length === 0)) {
    throw new AppError(errorCodes.INVALID_INPUT, "Some selected articles are no longer ready for summary generation.", 400);
  }

  const orderedItems = dedupedItemIds
    .map((itemId) => items.find((item) => item.id === itemId) || null)
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const run = await prisma.summaryRun.create({
    data: {
      userId,
      requestedTitle: input.requestedTitle?.trim() || null,
      windowStart: new Date(Math.min(...orderedItems.map((item) => item.createdAt.getTime()))),
      windowEnd: new Date(Math.max(...orderedItems.map((item) => item.createdAt.getTime()))),
      status: "QUEUED",
      targetLengthMinutes: input.targetLengthMinutes,
      selectedItemCount: orderedItems.length,
      podcastEnabled: input.podcastEnabled ?? true,
      items: {
        create: orderedItems.map((item, index) => ({
          itemId: item.id,
          orderIndex: index
        }))
      }
    },
    include: {
      episode: {
        select: {
          id: true,
          audioPath: true,
          audioBytes: true,
          mimeType: true,
          publishedAt: true
        }
      }
    }
  });

  return run;
}

export async function listSummaryRunsForUser(userId: string, limit = DEFAULT_SUMMARY_RUN_LIMIT): Promise<SummaryRunListEntry[]> {
  const normalizedLimit = Math.max(1, Math.min(limit, 50));

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const store = webPrimaryStore;
    const [runs, episodes] = await Promise.all([
      store.listSummaryRunsByUser(userId, normalizedLimit),
      store.listSummaryEpisodesForUser(userId)
    ]);
    const episodesByRunId = new Map(filterUnexpiredAudioEpisodes(episodes).map((episode) => [episode.summaryRunId, episode]));
    return runs.map((run) =>
      toUserFacingSummaryRun({
        ...run,
        episode: episodesByRunId.get(run.id)
          ? {
              id: episodesByRunId.get(run.id)?.id || "",
              audioPath: episodesByRunId.get(run.id)?.audioPath || "",
              audioBytes: episodesByRunId.get(run.id)?.audioBytes || 0,
              mimeType: episodesByRunId.get(run.id)?.mimeType || "audio/mpeg",
              publishedAt: episodesByRunId.get(run.id)?.publishedAt || run.createdAt
            }
          : null
      })
    );
  }

  return prisma.summaryRun.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: normalizedLimit,
    include: {
      episode: {
        select: {
          id: true,
          audioPath: true,
          audioBytes: true,
          mimeType: true,
          publishedAt: true,
          expiresAt: true
        }
      }
    }
  }).then((runs) =>
    runs.map((run) =>
      toUserFacingSummaryRun({
        ...run,
        episode: run.episode && isAudioAvailable(run.episode.expiresAt) ? run.episode : null
      })
    )
  );
}

export async function getSummaryRunMarkdown(userId: string, runId: string): Promise<{ title: string; markdown: string }> {
  const run =
    webUsesAzureTablePrimary() && webPrimaryStore
      ? await webPrimaryStore.findSummaryRunById(runId)
      : await prisma.summaryRun.findUnique({
          where: { id: runId },
          select: {
            id: true,
            userId: true,
            title: true,
            requestedTitle: true,
            summaryStorageKey: true
          }
        });

  if (!run || run.userId !== userId) {
    throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
  }
  if (!run.summaryStorageKey) {
    throw new AppError(errorCodes.MEDIA_NOT_FOUND, "Summary markdown is not ready yet.", 404);
  }

  const markdown = (await getArtifactStorage().getObject(run.summaryStorageKey)).toString("utf8");
  return {
    title: run.title || run.requestedTitle || "Summary",
    markdown
  };
}
