import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { FEEDBACK_FEATURE_AREAS, FEEDBACK_TYPES } from "@/lib/feedback";
import { findFeedbackById, updateFeedback } from "@/lib/feedback-store";
import { mirrorFeedback } from "@/lib/feedback-mirror";
import { fromError } from "@/lib/http";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const { id } = await params;
    const user = await getAuthUserFromRequest(request);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
    }

    const feedback = await findFeedbackById(id);
    if (!feedback) {
      return NextResponse.json({ ok: false, error_code: "NOT_FOUND", error_message: "Feedback item not found." }, { status: 404 });
    }

    const mirrorResult = await mirrorFeedback({
      id: feedback.id,
      message: feedback.message,
      feedbackType: (feedback.feedbackType as (typeof FEEDBACK_TYPES)[number] | null) ?? null,
      featureArea: (feedback.featureArea as (typeof FEEDBACK_FEATURE_AREAS)[number] | null) ?? null,
      allowEmailContact: feedback.allowEmailContact,
      status: feedback.status as "NEW" | "IN_REVIEW" | "PLANNED" | "DONE" | "DECLINED",
      sourcePath: feedback.sourcePath,
      createdAt: feedback.createdAt
    });

    const updated = await updateFeedback(feedback.id, {
      mirrorStatus: mirrorResult.mirrorStatus,
      mirrorAttemptedAt: mirrorResult.attemptedAt,
      mirrorIssueNumber: mirrorResult.issueNumber,
      mirrorIssueUrl: mirrorResult.issueUrl,
      mirrorErrorCode: mirrorResult.errorCode,
      mirrorErrorMessage: mirrorResult.errorMessage
    });
    if (!updated) {
      return NextResponse.json({ ok: false, error_code: "NOT_FOUND", error_message: "Feedback item not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      feedback: {
        id: updated.id,
        mirrorStatus: updated.mirrorStatus,
        mirrorIssueNumber: updated.mirrorIssueNumber,
        mirrorIssueUrl: updated.mirrorIssueUrl,
        mirrorErrorCode: updated.mirrorErrorCode,
        mirrorErrorMessage: updated.mirrorErrorMessage,
        mirrorAttemptedAt: updated.mirrorAttemptedAt ? updated.mirrorAttemptedAt.toISOString() : null
      }
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/admin/feedback/[id]/mirror"
    });
  }
}
