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
    const title = typeof formData.get("title") === "string" ? (formData.get("title") as string) : undefined;
    const priorityRaw = typeof formData.get("priority") === "string" ? (formData.get("priority") as string) : undefined;
    submitPdfSchema.parse({ title, priority: priorityRaw });

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

    const item = await enqueueItem({
      userId: user.id,
      title,
      priority: priorityRaw ?? "LOW",
      sourceType: "PDF",
      sourceFilePath: relativePath
    });
    await logger.info("PDF item enqueued", {
      requestId,
      itemId: item.id,
      userId: user.id
    });

    return NextResponse.json({ ok: true, item_id: item.id, status: item.status.toLowerCase() });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/items/pdf"
    });
  }
}
