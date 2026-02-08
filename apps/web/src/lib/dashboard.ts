import { hashIncomingToken } from "@listenlater/core";
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

export async function getAdminMetrics() {
  const [activeUsers, totalItems, readyItems, failedItems, recentErrors, recentJobs] = await Promise.all([
    prisma.user.count(),
    prisma.item.count(),
    prisma.item.count({ where: { status: "READY" } }),
    prisma.item.count({ where: { status: "FAILED" } }),
    prisma.jobEvent.findMany({
      where: { eventType: "error" },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    prisma.job.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { item: true } })
  ]);

  return {
    activeUsers,
    totalItems,
    readyItems,
    failedItems,
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
