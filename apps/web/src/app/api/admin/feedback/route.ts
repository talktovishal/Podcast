import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserFromRequest } from "@/lib/auth";
import { FEEDBACK_FEATURE_AREAS, FEEDBACK_MIRROR_STATUSES, FEEDBACK_STATUSES, FEEDBACK_TYPES, feedbackFeatureAreaLabel, feedbackTypeLabel } from "@/lib/feedback";
import { listFeedbackForAdmin } from "@/lib/feedback-store";
import { fromError } from "@/lib/http";

const statusFilterValues = ["ALL", ...FEEDBACK_STATUSES] as const;
const typeFilterValues = ["ALL", ...FEEDBACK_TYPES] as const;
const areaFilterValues = ["ALL", ...FEEDBACK_FEATURE_AREAS] as const;
const mirrorFilterValues = ["ALL", ...FEEDBACK_MIRROR_STATUSES] as const;

const querySchema = z.object({
  status: z.enum(statusFilterValues).optional(),
  feedbackType: z.enum(typeFilterValues).optional(),
  featureArea: z.enum(areaFilterValues).optional(),
  mirrorStatus: z.enum(mirrorFilterValues).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional()
});

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
    }

    const parsed = querySchema.parse({
      status: request.nextUrl.searchParams.get("status") || undefined,
      feedbackType: request.nextUrl.searchParams.get("feedbackType") || undefined,
      featureArea: request.nextUrl.searchParams.get("featureArea") || undefined,
      mirrorStatus: request.nextUrl.searchParams.get("mirrorStatus") || undefined,
      q: request.nextUrl.searchParams.get("q") || undefined,
      page: request.nextUrl.searchParams.get("page") || 1,
      pageSize: request.nextUrl.searchParams.get("page_size") || request.nextUrl.searchParams.get("pageSize") || 25
    });

    const page = parsed.page ?? 1;
    const pageSize = parsed.pageSize ?? 25;
    const { totalRows, totalPages, rows } = await listFeedbackForAdmin({
      status: parsed.status,
      feedbackType: parsed.feedbackType,
      featureArea: parsed.featureArea,
      mirrorStatus: parsed.mirrorStatus,
      q: parsed.q,
      page,
      pageSize
    });

    return NextResponse.json({
      ok: true,
      feedback: {
        pagination: {
          page,
          pageSize,
          totalRows,
          totalPages
        },
        rows: rows.map((row) => ({
          id: row.id,
          userId: row.userId,
          userEmail: row.userEmail,
          message: row.message,
          feedbackType: row.feedbackType,
          feedbackTypeLabel: feedbackTypeLabel(row.feedbackType as (typeof FEEDBACK_TYPES)[number] | null),
          featureArea: row.featureArea,
          featureAreaLabel: feedbackFeatureAreaLabel(row.featureArea as (typeof FEEDBACK_FEATURE_AREAS)[number] | null),
          allowEmailContact: row.allowEmailContact,
          status: row.status,
          sourcePath: row.sourcePath,
          mirrorStatus: row.mirrorStatus,
          mirrorIssueNumber: row.mirrorIssueNumber,
          mirrorIssueUrl: row.mirrorIssueUrl,
          mirrorAttemptedAt: row.mirrorAttemptedAt ? row.mirrorAttemptedAt.toISOString() : null,
          mirrorErrorCode: row.mirrorErrorCode,
          mirrorErrorMessage: row.mirrorErrorMessage,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString()
        }))
      }
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/admin/feedback"
    });
  }
}
