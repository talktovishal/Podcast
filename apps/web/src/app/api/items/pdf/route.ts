import { makeToken, submitPdfSchema } from "@articlepod/core";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { ensureDataDirs } from "@/lib/fs";
import { fromError } from "@/lib/http";
import { enqueueItem } from "@/lib/items";
import { logger } from "@/lib/logger";
import { enforceSubmitRateLimits, getClientIp } from "@/lib/rate-limit";
import { getArtifactStorage, normalizeStorageKey } from "@/lib/storage";

const MAX_PDF_BYTES = 20 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request);
    await enforceSubmitRateLimits(user.id, ip);

    const formData = await request.formData();
    const file = formData.get("file");
    const rawTitle = typeof formData.get("title") === "string" ? (formData.get("title") as string) : undefined;
    const rawImportance = typeof formData.get("importance") === "string" ? (formData.get("importance") as string) : undefined;
    const rawPriority = typeof formData.get("priority") === "string" ? (formData.get("priority") as string) : undefined;
    const rawTags = typeof formData.get("tags") === "string" ? (formData.get("tags") as string) : undefined;
    const parsed = submitPdfSchema.parse({ title: rawTitle, importance: rawImportance, priority: rawPriority, tags: rawTags });
    const { title, importance, tags } = parsed;

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error_code: "INVALID_INPUT", error_message: "PDF file is required." }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ ok: false, error_code: "INVALID_INPUT", error_message: "Only PDF uploads are supported." }, { status: 400 });
    }

    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ ok: false, error_code: "INVALID_INPUT", error_message: "PDF exceeds size limit (20MB)." }, { status: 400 });
    }

    await ensureDataDirs();
    const random = makeToken(10);
    const relativePath = normalizeStorageKey(join("uploads", user.id, `${Date.now()}-${random}.pdf`));

    const bytes = Buffer.from(await file.arrayBuffer());

    // Validate PDF magic bytes (%PDF-)
    if (bytes.length < 5 || bytes.slice(0, 5).toString("ascii") !== "%PDF-") {
      return NextResponse.json({ ok: false, error_code: "INVALID_FILE_TYPE", error_message: "File must be a valid PDF." }, { status: 400 });
    }
    await getArtifactStorage().putObject(relativePath, bytes, {
      contentType: "application/pdf"
    });

    const submission = await enqueueItem({
      userId: user.id,
      title,
      importance,
      tags,
      sourceType: "PDF",
      sourceFilePath: relativePath
    });
    await logger.info("PDF item enqueued", {
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
      route: "/api/items/pdf"
    });
  }
}
