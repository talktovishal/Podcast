import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
  }

  const [activeUsers, totalItems, readyItems, failedItems, queuedJobs, processingJobs] = await Promise.all([
    prisma.user.count(),
    prisma.item.count(),
    prisma.item.count({ where: { status: "READY" } }),
    prisma.item.count({ where: { status: "FAILED" } }),
    prisma.job.count({ where: { status: "QUEUED" } }),
    prisma.job.count({ where: { status: "PROCESSING" } })
  ]);

  return NextResponse.json({
    ok: true,
    metrics: {
      active_users: activeUsers,
      total_items: totalItems,
      ready_items: readyItems,
      failed_items: failedItems,
      queued_jobs: queuedJobs,
      processing_jobs: processingJobs
    }
  });
}
