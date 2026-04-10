import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserFromRequest } from "@/lib/auth";
import { FEEDBACK_STATUSES } from "@/lib/feedback";
import { findFeedbackById, updateFeedback } from "@/lib/feedback-store";
import { fromError } from "@/lib/http";

const updateStatusSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES)
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
    }

    const payload = updateStatusSchema.parse(await request.json());
    const existing = await findFeedbackById(params.id);
    if (!existing) {
      return NextResponse.json({ ok: false, error_code: "NOT_FOUND", error_message: "Feedback item not found." }, { status: 404 });
    }

    const feedback = await updateFeedback(params.id, {
      status: payload.status
    });
    if (!feedback) {
      return NextResponse.json({ ok: false, error_code: "NOT_FOUND", error_message: "Feedback item not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      feedback: {
        id: feedback.id,
        status: feedback.status,
        updatedAt: feedback.updatedAt.toISOString()
      }
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/admin/feedback/[id]/status"
    });
  }
}
