import { canonicalizeFetchableUrl, submitUrlSchema } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { fromError } from "@/lib/http";
import { enqueueItem } from "@/lib/items";
import { enforceSubmitRateLimits, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const payload = submitUrlSchema.parse(await request.json());
    const ip = getClientIp(request);
    await enforceSubmitRateLimits(user.id, ip);

    const canonical = await canonicalizeFetchableUrl(payload.url);

    const submission = await enqueueItem({
      userId: user.id,
      title: payload.title,
      importance: payload.importance,
      tags: payload.tags,
      sourceType: "URL",
      sourceUrl: canonical.canonicalUrl
    });
    await logger.info("URL item enqueued", {
      requestId,
      itemId: submission.item.id,
      userId: user.id,
      canonicalized: canonical.redirected,
      redirectCount: canonical.redirectCount
    });

    return NextResponse.json({
      ok: true,
      item_id: submission.item.id,
      status: submission.item.status.toLowerCase(),
      queue_mode: submission.queueMode.toLowerCase(),
      accepted_message: submission.acceptedMessage,
      scheduled_for: submission.scheduledFor.toISOString(),
      submission_quota: submission.submissionQuota
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/items/url"
    });
  }
}
