import { makeToken, submitPdfSchema } from "@listenlater/core";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { env } from "@/lib/env";
import { ensureDataDirs } from "@/lib/fs";
import { fromError } from "@/lib/http";
import { enqueueItem } from "@/lib/items";
import { enforceSubmitRateLimits } from "@/lib/rate-limit";

const MAX_PDF_BYTES = 20 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    enforceSubmitRateLimits(user.id, ip);

    const formData = await request.formData();
    const file = formData.get("file");
    const title = typeof formData.get("title") === "string" ? (formData.get("title") as string) : undefined;
    submitPdfSchema.parse({ title });

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
    const relativePath = join(user.id, `${Date.now()}-${random}.pdf`);
    const fullPath = join(env.uploadRoot, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });

    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(fullPath, bytes);

    const item = await enqueueItem({
      userId: user.id,
      title,
      sourceType: "PDF",
      sourceFilePath: fullPath
    });

    return NextResponse.json({ ok: true, item_id: item.id, status: item.status.toLowerCase() });
  } catch (error) {
    return fromError(error);
  }
}
