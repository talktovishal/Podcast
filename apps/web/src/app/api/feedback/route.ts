import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserFromRequest } from "@/lib/auth";
import { FEEDBACK_FEATURE_AREAS, FEEDBACK_TYPES, feedbackFeatureAreaLabel, feedbackTypeLabel } from "@/lib/feedback";
import { mirrorFeedback } from "@/lib/feedback-mirror";
import { fromError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { enforceFeedbackRateLimits, getClientIp } from "@/lib/rate-limit";

const submitFeedbackSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  feedbackType: z.enum(FEEDBACK_TYPES).nullable().optional(),
  featureArea: z.enum(FEEDBACK_FEATURE_AREAS).nullable().optional(),
  allowEmailContact: z.boolean().optional(),
  sourcePath: z.string().trim().min(1).max(200).nullable().optional()
});

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const payload = submitFeedbackSchema.parse(await request.json());
    const ip = getClientIp(request);
    await enforceFeedbackRateLimits(user.id, ip);

    const fallbackSourcePath = (() => {
      const referer = request.headers.get("referer");
      if (!referer) {
        return null;
      }
      try {
        return new URL(referer).pathname.slice(0, 200) || null;
      } catch {
        return null;
      }
    })();

    const feedback = await prisma.userFeedback.create({
      data: {
        userId: user.id,
        message: payload.message,
        feedbackType: payload.feedbackType || null,
        featureArea: payload.featureArea || null,
        allowEmailContact: payload.allowEmailContact ?? true,
        status: "NEW",
        sourcePath: payload.sourcePath || fallbackSourcePath,
        mirrorStatus: "PENDING"
      }
    });

    const mirrorResult = await mirrorFeedback({
      id: feedback.id,
      message: feedback.message,
      feedbackType: (feedback.feedbackType as (typeof FEEDBACK_TYPES)[number] | null) ?? null,
      featureArea: (feedback.featureArea as (typeof FEEDBACK_FEATURE_AREAS)[number] | null) ?? null,
      allowEmailContact: feedback.allowEmailContact,
      status: "NEW",
      sourcePath: feedback.sourcePath,
      createdAt: feedback.createdAt
    });

    const updated = await prisma.userFeedback.update({
      where: { id: feedback.id },
      data: {
        mirrorStatus: mirrorResult.mirrorStatus,
        mirrorAttemptedAt: mirrorResult.attemptedAt,
        mirrorIssueNumber: mirrorResult.issueNumber,
        mirrorIssueUrl: mirrorResult.issueUrl,
        mirrorErrorCode: mirrorResult.errorCode,
        mirrorErrorMessage: mirrorResult.errorMessage
      }
    });

    return NextResponse.json({
      ok: true,
      feedback: {
        id: updated.id,
        message: updated.message,
        feedbackType: updated.feedbackType,
        feedbackTypeLabel: feedbackTypeLabel(updated.feedbackType as (typeof FEEDBACK_TYPES)[number] | null),
        featureArea: updated.featureArea,
        featureAreaLabel: feedbackFeatureAreaLabel(updated.featureArea as (typeof FEEDBACK_FEATURE_AREAS)[number] | null),
        allowEmailContact: updated.allowEmailContact,
        status: updated.status,
        sourcePath: updated.sourcePath,
        mirrorStatus: updated.mirrorStatus,
        mirrorIssueUrl: updated.mirrorIssueUrl,
        createdAt: updated.createdAt.toISOString()
      }
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/feedback"
    });
  }
}
