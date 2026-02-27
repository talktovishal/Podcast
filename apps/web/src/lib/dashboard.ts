import { hashIncomingToken } from "@articlepod/core";
import {
  type DemoExtractionDiagnostic,
  normalizeExtractionLogEntries
} from "./demo-diagnostics";
import { prisma } from "./prisma";

export async function getActiveFeedTokenForUser(userId: string): Promise<string | null> {
  const token = await prisma.feedToken.findFirst({ where: { userId, active: true }, orderBy: { createdAt: "desc" } });
  return token?.tokenValue ?? null;
}

export async function getDashboardItems(userId: string) {
  return prisma.item.findMany({
    where: { userId },
    include: {
      episode: true
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });
}

export async function getDemoExtractionDiagnostics(userId: string, limit = 10): Promise<DemoExtractionDiagnostic[]> {
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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ttsProvider: true,
      ttsVoice: true
    }
  });
  return {
    providerId: user?.ttsProvider || "kokoro",
    voice: user?.ttsVoice || "af_heart"
  };
}

export async function getUserDigestSettings(userId: string) {
  return prisma.userDigestSettings.findUnique({
    where: { userId }
  });
}

export async function getRecentDigestRuns(userId: string, limit = 20) {
  return prisma.digestRun.findMany({
    where: { userId },
    orderBy: [{ scheduledFor: "desc" }, { createdAt: "desc" }],
    take: Math.max(1, Math.min(limit, 50)),
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
}

export async function getAdminMetrics() {
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
    prisma.jobEvent.findMany({
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
  return prisma.feedToken.findFirst({
    where: { tokenHash, active: true },
    include: { user: true }
  });
}
