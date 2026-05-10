import { HTML_SNAPSHOT_MAX_BYTES, classifyTranscriptCandidate, makeToken, submitHtmlSnapshotSchema } from "@articlepod/core";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromExtensionTokenRequest, getAuthUserFromRequest } from "@/lib/auth";
import { fromError } from "@/lib/http";
import { enqueueItem } from "@/lib/items";
import { logger } from "@/lib/logger";
import { enforceSubmitRateLimits, getClientIp } from "@/lib/rate-limit";
import { getArtifactStorage, normalizeStorageKey } from "@/lib/storage";

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const [sessionUser, extensionUser] = await Promise.all([
      getAuthUserFromRequest(request),
      getAuthUserFromExtensionTokenRequest(request)
    ]);
    const user = sessionUser ?? extensionUser;
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const payload = submitHtmlSnapshotSchema.parse(await request.json());
    const ip = getClientIp(request);
    await enforceSubmitRateLimits(user.id, ip);

    const transcriptCandidate = classifyTranscriptCandidate({ url: payload.url, html: payload.html });
    if (transcriptCandidate.kind !== "none") {
      const submission = await enqueueItem({
        userId: user.id,
        title: payload.title,
        importance: payload.importance,
        tags: payload.tags,
        mode: "summary",
        sourceType: "PODCAST_TRANSCRIPT",
        sourceUrl: payload.url,
        sourceCapturedAt: payload.capturedAt ? new Date(payload.capturedAt) : undefined
      });
      await logger.info("Podcast transcript capture item enqueued", {
        requestId,
        itemId: submission.item.id,
        userId: user.id,
        transcriptCandidate: transcriptCandidate.kind
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
    }

    const htmlBytes = Buffer.byteLength(payload.html, "utf8");
    if (htmlBytes > HTML_SNAPSHOT_MAX_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "Captured page is too large. Try a simpler page or remove heavy dynamic sections."
        },
        { status: 400 }
      );
    }

    const snapshotKey = normalizeStorageKey(join("uploads", user.id, `snapshot-${Date.now()}-${makeToken(8)}.html`));
    await getArtifactStorage().putObject(snapshotKey, Buffer.from(payload.html, "utf8"), {
      contentType: "text/html; charset=utf-8"
    });

    const submission = await enqueueItem({
      userId: user.id,
      title: payload.title,
      importance: payload.importance,
      tags: payload.tags,
      mode: payload.mode,
      sourceType: "HTML_SNAPSHOT",
      sourceUrl: payload.url,
      sourceFilePath: snapshotKey,
      sourceCapturedAt: payload.capturedAt ? new Date(payload.capturedAt) : undefined
    });
    await logger.info("HTML snapshot item enqueued", {
      requestId,
      itemId: submission.item.id,
      userId: user.id
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
      route: "/api/items/html-snapshot"
    });
  }
}
