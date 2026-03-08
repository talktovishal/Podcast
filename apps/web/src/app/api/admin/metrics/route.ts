import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getAdminMetrics } from "@/lib/dashboard";

export async function GET(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
  }

  const metrics = await getAdminMetrics();

  return NextResponse.json({
    ok: true,
    metrics: {
      active_users: metrics.activeUsers,
      total_items: metrics.totalItems,
      ready_items: metrics.readyItems,
      failed_items: metrics.failedItems,
      queued_jobs: metrics.queuedJobs,
      processing_jobs: metrics.processingJobs,
      retryable_failed_jobs: metrics.retryableFailedJobs,
      avg_queue_wait_ms: metrics.avgQueueWaitMs,
      avg_processing_age_ms: metrics.avgProcessingAgeMs,
      top_error_codes: metrics.topErrorCodes
    }
  });
}
