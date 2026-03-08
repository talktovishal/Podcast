import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
  }

  const [activeUsers, totalItems, readyItems, failedItems, queuedJobs, processingJobs, retryableFailedJobs, recentJobs, recentErrors] =
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
    prisma.job.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    env.jobEventStorageMode === "off"
      ? Promise.resolve([])
      : prisma.jobEvent.findMany({ where: { eventType: "error" }, orderBy: { createdAt: "desc" }, take: 20 })
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

  return NextResponse.json({
    ok: true,
    metrics: {
      active_users: activeUsers,
      total_items: totalItems,
      ready_items: readyItems,
      failed_items: failedItems,
      queued_jobs: queuedJobs,
      processing_jobs: processingJobs,
      retryable_failed_jobs: retryableFailedJobs,
      avg_queue_wait_ms: avgQueueWaitMs,
      avg_processing_age_ms: avgProcessingAgeMs,
      top_error_codes: Array.from(topErrorCodes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code, count]) => ({ code, count }))
    }
  });
}
