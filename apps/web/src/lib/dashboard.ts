import { hashIncomingToken, parseStoredItemTags } from "@articlepod/core";
import {
  type DemoExtractionDiagnostic,
  normalizeExtractionLogEntries
} from "./demo-diagnostics";
import type { UserDemographicSurveyView } from "./demographics";
import { env } from "./env";
import {
  findPrimaryActiveFeedTokenByUserId,
  findPrimaryDigestSettingsByUserId,
  listPrimaryShareTokensByUserIdAndScopePrefix,
  findPrimaryUserByFeedTokenHash,
  findPrimaryUserById,
  findPrimaryUserDemographicSurvey,
  listPrimaryDigestRunsByUser
} from "./metadata-primary-auth";
import { webPrimaryStore, webUsesAzureTablePrimary } from "./metadata-primary-store";
import { prisma } from "./prisma";
import {
  buildPublicEpisodeShareUrl,
  parsePublicEpisodeShareItemId,
  PUBLIC_EPISODE_SHARE_SCOPE_PREFIX
} from "./share-links";

const ADMIN_MAX_RETRY_ATTEMPTS = Number(process.env.WORKER_MAX_RETRY_ATTEMPTS ?? 5);

type DashboardItemImportance = "LOW" | "MEDIUM" | "HIGH";

type DashboardItemRecord = {
  id: string;
  userId: string;
  title: string | null;
  sourceType: string;
  sourceUrl: string | null;
  sourceFilePath: string | null;
  sourceHtml: string | null;
  sourceCapturedAt: Date | null;
  status: string;
  importance: DashboardItemImportance;
  tags: string[];
  errorCode: string | null;
  errorMessage: string | null;
  textHash: string | null;
  createdAt: Date;
  updatedAt: Date;
  share:
    | {
        shareId: string;
        shareUrl: string;
      }
    | null;
  episode:
    | {
        id: string;
        itemId: string;
        guid: string;
        title: string;
        description: string;
        audioPath: string;
        audioBytes: number;
        mimeType: string;
        publishedAt: Date;
        createdAt: Date;
      }
    | null;
};

export async function getActiveFeedTokenForUser(userId: string): Promise<string | null> {
  const token = await findPrimaryActiveFeedTokenByUserId(userId, "item");
  return token?.tokenValue ?? null;
}

export async function getDashboardItems(userId: string): Promise<DashboardItemRecord[]> {
  const shares = await listPrimaryShareTokensByUserIdAndScopePrefix(userId, PUBLIC_EPISODE_SHARE_SCOPE_PREFIX);
  const sharesByItemId = new Map<string, { shareId: string; shareUrl: string }>();
  for (const share of shares) {
    const itemId = parsePublicEpisodeShareItemId(share.scope);
    if (!itemId || sharesByItemId.has(itemId)) {
      continue;
    }
    sharesByItemId.set(itemId, {
      shareId: share.id,
      shareUrl: buildPublicEpisodeShareUrl(share)
    });
  }

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const [items, episodes] = await Promise.all([webPrimaryStore.listItemsByUser(userId, 50), webPrimaryStore.listEpisodesForUser(userId)]);
    const episodesByItemId = new Map(episodes.map((episode) => [episode.itemId, episode]));
    return items.map((item) => ({
      id: item.id,
      userId: item.userId,
      title: item.title,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      sourceFilePath: item.sourceFilePath,
      sourceHtml: item.sourceHtml,
      sourceCapturedAt: item.sourceCapturedAt,
      status: item.status,
      importance: item.priority as DashboardItemImportance,
      tags: item.tags,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      textHash: item.textHash,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      share: sharesByItemId.get(item.id) ?? null,
      episode: episodesByItemId.get(item.id) ?? null
    }));
  }

  const items = await prisma.item.findMany({
    where: { userId },
    include: {
      episode: true
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return items.map((item) => ({
    id: item.id,
    userId: item.userId,
    title: item.title,
    sourceType: item.sourceType,
    sourceUrl: item.sourceUrl,
    sourceFilePath: item.sourceFilePath,
    sourceHtml: item.sourceHtml,
    sourceCapturedAt: item.sourceCapturedAt,
    status: item.status,
    importance: item.priority as DashboardItemImportance,
    tags: parseStoredItemTags(item.tagsJson),
    errorCode: item.errorCode,
    errorMessage: item.errorMessage,
    textHash: item.textHash,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    share: sharesByItemId.get(item.id) ?? null,
    episode: item.episode
  }));
}

export async function getDemoExtractionDiagnostics(userId: string, limit = 10): Promise<DemoExtractionDiagnostic[]> {
  if (!env.demoExtractionTraceEnabled) {
    return [];
  }

  const traces = await prisma.demoExtractionTrace.findMany({
    where: { userId },
    include: {
      item: {
        select: {
          id: true,
          title: true,
          sourceType: true,
          sourceUrl: true,
          status: true,
          errorCode: true,
          errorMessage: true
        }
      }
    },
    orderBy: { updatedAt: "desc" },
    take: limit
  });

  return traces.map((trace) => ({
    id: trace.id,
    itemId: trace.item.id,
    itemTitle: trace.item.title,
    sourceType: trace.item.sourceType,
    sourceUrl: trace.item.sourceUrl,
    sourceLabel: trace.sourceLabel,
    status: trace.item.status,
    errorCode: trace.item.errorCode,
    errorMessage: trace.item.errorMessage,
    createdAt: trace.updatedAt.toISOString(),
    extractedText: trace.extractedText,
    extractedMarkdown: trace.extractedMarkdown,
    logEntries: normalizeExtractionLogEntries(trace.extractionLogJson)
  }));
}

export async function getUserTtsSettings(userId: string): Promise<{ providerId: string; voice: string }> {
  const user = await findPrimaryUserById(userId);
  return {
    providerId: user?.ttsProvider || "kokoro",
    voice: user?.ttsVoice || "af_heart"
  };
}

export async function getUserDigestSettings(userId: string) {
  return findPrimaryDigestSettingsByUserId(userId);
}

export async function getRecentDigestRuns(userId: string, limit = 20) {
  return listPrimaryDigestRunsByUser(userId, Math.max(1, Math.min(limit, 50)));
}

export async function getUserDemographicSurvey(userId: string): Promise<UserDemographicSurveyView> {
  const survey = await findPrimaryUserDemographicSurvey(userId);

  if (!survey) {
    return {
      status: "PENDING",
      ageBand: null,
      genderIdentity: null,
      genderSelfDescribe: null,
      completedAt: null,
      skippedAt: null,
      deletedAt: null,
      updatedAt: null
    };
  }

  return {
    status: survey.status === "COMPLETED" || survey.status === "SKIPPED" ? survey.status : "PENDING",
    ageBand: survey.ageBand as UserDemographicSurveyView["ageBand"],
    genderIdentity: survey.genderIdentity as UserDemographicSurveyView["genderIdentity"],
    genderSelfDescribe: survey.genderSelfDescribe,
    completedAt: survey.completedAt ? survey.completedAt.toISOString() : null,
    skippedAt: survey.skippedAt ? survey.skippedAt.toISOString() : null,
    deletedAt: survey.deletedAt ? survey.deletedAt.toISOString() : null,
    updatedAt: survey.updatedAt.toISOString()
  };
}

export async function getAdminMetrics() {
  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const store = webPrimaryStore;
    const nowTs = new Date();
    const [activeUsers, totalItems, readyItems, failedItems, queuedJobs, processingJobs, retryableFailedJobs, recentJobs, recentErrors] =
      await Promise.all([
        store.countUsers(),
        store.countItems(),
        store.countItems("READY"),
        store.countItems("FAILED"),
        store.countJobs({ status: "QUEUED" }),
        store.countJobs({ status: "PROCESSING" }),
        store.countJobs({
          status: "FAILED",
          retryableBefore: nowTs,
          maxRetryAttempts: ADMIN_MAX_RETRY_ATTEMPTS
        }),
        store.listRecentJobs(20),
        env.jobEventStorageMode === "off"
          ? Promise.resolve([])
          : prisma.jobEvent.findMany({
              where: { eventType: "error" },
              orderBy: { createdAt: "desc" },
              take: 20
            })
      ]);

    const recentJobsWithItems = await Promise.all(
      recentJobs.map(async (job) => {
        const item = await store.findItemById(job.itemId);
        return {
          ...job,
          item
        };
      })
    );

    const now = Date.now();
    const queueAgeSamples = recentJobs
      .filter((job) => job.status === "QUEUED")
      .map((job) => Math.max(0, now - job.createdAt.getTime()));
    const processingAgeSamples = recentJobs
      .filter((job) => job.status === "PROCESSING")
      .map((job) => Math.max(0, now - job.updatedAt.getTime()));
    const avgQueueWaitMs =
      queueAgeSamples.length > 0 ? Math.round(queueAgeSamples.reduce((sum, value) => sum + value, 0) / queueAgeSamples.length) : 0;
    const avgProcessingAgeMs =
      processingAgeSamples.length > 0
        ? Math.round(processingAgeSamples.reduce((sum, value) => sum + value, 0) / processingAgeSamples.length)
        : 0;
    const topErrorCodes = new Map<string, number>();
    for (const event of recentErrors) {
      const payload = event.payloadJson as Record<string, unknown> | null;
      const candidate = payload?.error_code ?? payload?.errorCode ?? payload?.code;
      const code = typeof candidate === "string" && candidate.trim() ? candidate.trim() : "UNKNOWN";
      topErrorCodes.set(code, (topErrorCodes.get(code) || 0) + 1);
    }

    return {
      activeUsers,
      totalItems,
      readyItems,
      failedItems,
      queuedJobs,
      processingJobs,
      retryableFailedJobs,
      avgQueueWaitMs,
      avgProcessingAgeMs,
      topErrorCodes: Array.from(topErrorCodes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code, count]) => ({ code, count })),
      recentErrors,
      recentJobs: recentJobsWithItems
    };
  }

  const [activeUsers, totalItems, readyItems, failedItems, queuedJobs, processingJobs, retryableFailedJobs, recentErrors, recentJobs] =
    await Promise.all([
    prisma.user.count(),
    prisma.item.count(),
    prisma.item.count({ where: { status: "READY" } }),
    prisma.item.count({ where: { status: "FAILED" } }),
    prisma.job.count({ where: { status: "QUEUED" } }),
    prisma.job.count({ where: { status: "PROCESSING" } }),
    prisma.job.count({
      where: {
        status: "FAILED",
        nextRetryAt: {
          lte: new Date()
        }
      }
    }),
    env.jobEventStorageMode === "off"
      ? Promise.resolve([])
      : prisma.jobEvent.findMany({
          where: { eventType: "error" },
          orderBy: { createdAt: "desc" },
          take: 20
        }),
    prisma.job.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { item: true } })
  ]);

  const now = Date.now();
  const queueAgeSamples = recentJobs
    .filter((job) => job.status === "QUEUED")
    .map((job) => Math.max(0, now - job.createdAt.getTime()));
  const processingAgeSamples = recentJobs
    .filter((job) => job.status === "PROCESSING")
    .map((job) => Math.max(0, now - job.updatedAt.getTime()));
  const avgQueueWaitMs =
    queueAgeSamples.length > 0 ? Math.round(queueAgeSamples.reduce((sum, value) => sum + value, 0) / queueAgeSamples.length) : 0;
  const avgProcessingAgeMs =
    processingAgeSamples.length > 0
      ? Math.round(processingAgeSamples.reduce((sum, value) => sum + value, 0) / processingAgeSamples.length)
      : 0;
  const topErrorCodes = new Map<string, number>();
  for (const event of recentErrors) {
    const payload = event.payloadJson as Record<string, unknown> | null;
    const candidate = payload?.error_code ?? payload?.errorCode ?? payload?.code;
    const code = typeof candidate === "string" && candidate.trim() ? candidate.trim() : "UNKNOWN";
    topErrorCodes.set(code, (topErrorCodes.get(code) || 0) + 1);
  }

  return {
    activeUsers,
    totalItems,
    readyItems,
    failedItems,
    queuedJobs,
    processingJobs,
    retryableFailedJobs,
    avgQueueWaitMs,
    avgProcessingAgeMs,
    topErrorCodes: Array.from(topErrorCodes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code, count]) => ({ code, count })),
    recentErrors,
    recentJobs
  };
}

export async function getUserByFeedToken(token: string) {
  const tokenHash = hashIncomingToken(token);
  const user = await findPrimaryUserByFeedTokenHash(tokenHash, "item");
  return user ? { user } : null;
}
