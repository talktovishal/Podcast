import { getTtsCatalog, normalizeTtsSelection, updateTtsSettingsSchema } from "@listenlater/core";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertTtsSelectionAvailable, getTtsProviderAvailability } from "@/lib/tts";

const KOKORO_PROVIDER_ID = "kokoro";

export async function GET(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const [stored, availability] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { ttsProvider: true, ttsVoice: true }
    }),
    getTtsProviderAvailability()
  ]);
  const selection = normalizeTtsSelection({
    providerId: KOKORO_PROVIDER_ID,
    voice: stored?.ttsVoice
  });

  return NextResponse.json({
    ok: true,
    selection,
    availability,
    catalog: getTtsCatalog()
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = updateTtsSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "INVALID_INPUT",
        error_message: "Voice is required."
      },
      { status: 400 }
    );
  }

  try {
    const selection = await assertTtsSelectionAvailable({
      providerId: KOKORO_PROVIDER_ID,
      voice: parsed.data.voice
    });
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ttsProvider: selection.providerId,
        ttsVoice: selection.voice
      }
    });

    return NextResponse.json({
      ok: true,
      selection
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TTS provider is unavailable.";
    return NextResponse.json(
      {
        ok: false,
        error_code: "TTS_UNAVAILABLE",
        error_message: message
      },
      { status: 400 }
    );
  }
}
