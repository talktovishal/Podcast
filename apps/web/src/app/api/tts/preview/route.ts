import { previewTtsSchema } from "@listenlater/core";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { synthesizePreviewDataUrl } from "@/lib/tts";

const DEFAULT_SAMPLE_TEXT =
  "Hello from ListenLater. This is a quick voice sample so you can choose the default narration style.";

export async function POST(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = previewTtsSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "Provider and voice are required for preview."
      },
      { status: 400 }
    );
  }

  try {
    const preview = await synthesizePreviewDataUrl({
      providerId: parsed.data.providerId,
      voice: parsed.data.voice,
      text: parsed.data.text || DEFAULT_SAMPLE_TEXT
    });

    return NextResponse.json({
      ok: true,
      preview
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview generation failed.";
    return NextResponse.json(
      {
        ok: false,
        error_code: "TTS_PREVIEW_FAILED",
        error_message: message
      },
      { status: 400 }
    );
  }
}
