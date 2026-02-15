import { previewTtsSchema } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getKokoroPreviewSampleText, synthesizePreviewDataUrl } from "@/lib/tts";

const KOKORO_PROVIDER_ID = "kokoro";

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
        error_message: "Voice is required for preview."
      },
      { status: 400 }
    );
  }

  try {
    const preview = await synthesizePreviewDataUrl({
      providerId: KOKORO_PROVIDER_ID,
      voice: parsed.data.voice
    });

    return NextResponse.json({
      ok: true,
      preview,
      sampleText: getKokoroPreviewSampleText()
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
