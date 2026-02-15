import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  BRAND_NAME,
  AppError,
  KokoroTtsProvider,
  errorCodes,
  getTtsVoiceOptions,
  normalizeTtsSelection,
  type TtsProvider,
  type TtsProviderId
} from "@articlepod/core";
import { env } from "./env";

const ENABLED_PROVIDER_ID: TtsProviderId = "kokoro";
const PREVIEW_EXTENSION = "m4a";
const PREVIEW_MIME_TYPE = "audio/mp4";
const PREVIEW_SAMPLE_TEXT =
  `Hello from ${BRAND_NAME}. This is a quick voice sample so you can choose the default narration style.`;

export type TtsSelection = {
  providerId: TtsProviderId;
  voice: string;
};

export type ProviderAvailability = {
  available: boolean;
  reason?: string;
};

function makeTtsProvider(selection: TtsSelection): TtsProvider {
  if (selection.providerId !== ENABLED_PROVIDER_ID) {
    throw new AppError(errorCodes.TTS_FAILED, "Only Kokoro-82M is enabled for this environment.", 400);
  }
  return new KokoroTtsProvider(env.pythonTtsUrl, env.pythonTtsTimeoutMs);
}

function previewDirPath(): string {
  return join(env.mediaRoot, "tts-previews", ENABLED_PROVIDER_ID);
}

function previewFilePath(voice: string): string {
  return join(previewDirPath(), `${voice}.${PREVIEW_EXTENSION}`);
}

async function hasNonEmptyFile(path: string): Promise<boolean> {
  try {
    const fileInfo = await stat(path);
    return fileInfo.size > 0;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

type PythonHealthPayload = {
  providers?: Record<string, { available: boolean; reason?: string }>;
};

async function loadPythonProviderHealth(): Promise<Record<string, { available: boolean; reason?: string }>> {
  try {
    const response = await fetch(`${env.pythonTtsUrl.replace(/\/+$/, "")}/health`, {
      signal: AbortSignal.timeout(3_000)
    });
    if (!response.ok) {
      return {};
    }
    const payload = (await response.json()) as PythonHealthPayload;
    return payload.providers || {};
  } catch {
    return {};
  }
}

export async function getTtsProviderAvailability(): Promise<Record<TtsProviderId, ProviderAvailability>> {
  const python = await loadPythonProviderHealth();
  const kokoro = python.kokoro;

  return {
    "mac-say": { available: false, reason: "Disabled in this build." },
    kokoro: kokoro
      ? { available: Boolean(kokoro.available), reason: kokoro.reason }
      : { available: false, reason: "python-tts service not reachable" },
    melo: { available: false, reason: "Hidden in this build." },
    openai: { available: false, reason: "Disabled in this build." }
  };
}

export async function assertTtsSelectionAvailable(selectionInput: { providerId?: string | null; voice?: string | null }): Promise<TtsSelection> {
  const selection = normalizeTtsSelection({
    providerId: ENABLED_PROVIDER_ID,
    voice: selectionInput.voice
  });
  const availability = await getTtsProviderAvailability();
  const status = availability[ENABLED_PROVIDER_ID];
  if (!status.available) {
    throw new AppError(
      errorCodes.TTS_FAILED,
      `Kokoro-82M is not available in this environment${status.reason ? ` (${status.reason})` : ""}.`,
      400
    );
  }
  return {
    providerId: ENABLED_PROVIDER_ID,
    voice: selection.voice
  };
}

async function ensureCachedKokoroPreview(selection: TtsSelection): Promise<string> {
  const outPath = previewFilePath(selection.voice);
  if (await hasNonEmptyFile(outPath)) {
    return outPath;
  }

  await mkdir(previewDirPath(), { recursive: true });
  const provider = makeTtsProvider(selection);
  await provider.synthesizeToFile({
    text: PREVIEW_SAMPLE_TEXT,
    voice: selection.voice,
    format: provider.outputFormat,
    outPath
  });

  if (!(await hasNonEmptyFile(outPath))) {
    throw new AppError(errorCodes.TTS_FAILED, `Preview generation produced an empty file for voice '${selection.voice}'.`, 500);
  }

  return outPath;
}

export async function precomputeKokoroVoicePreviews(): Promise<{
  created: number;
  reused: number;
  failed: Array<{ voice: string; error: string }>;
}> {
  const availability = await getTtsProviderAvailability();
  const status = availability[ENABLED_PROVIDER_ID];
  if (!status.available) {
    throw new AppError(
      errorCodes.TTS_FAILED,
      `Kokoro-82M preview precompute cannot start${status.reason ? ` (${status.reason})` : ""}.`,
      400
    );
  }

  await mkdir(previewDirPath(), { recursive: true });
  const result = {
    created: 0,
    reused: 0,
    failed: [] as Array<{ voice: string; error: string }>
  };

  for (const voice of getTtsVoiceOptions(ENABLED_PROVIDER_ID)) {
    const voicePath = previewFilePath(voice.id);
    if (await hasNonEmptyFile(voicePath)) {
      result.reused += 1;
      continue;
    }

    try {
      await ensureCachedKokoroPreview({
        providerId: ENABLED_PROVIDER_ID,
        voice: voice.id
      });
      result.created += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed.push({ voice: voice.id, error: message });
    }
  }

  return result;
}

export function getKokoroPreviewSampleText(): string {
  return PREVIEW_SAMPLE_TEXT;
}

export async function synthesizePreviewDataUrl(input: {
  providerId?: string | null;
  voice?: string | null;
  text?: string;
}): Promise<{ providerId: TtsProviderId; voice: string; mimeType: string; dataUrl: string }> {
  const selection = await assertTtsSelectionAvailable({
    providerId: ENABLED_PROVIDER_ID,
    voice: input.voice
  });
  const outPath = await ensureCachedKokoroPreview(selection);
  const buffer = await readFile(outPath);

  return {
    providerId: selection.providerId,
    voice: selection.voice,
    mimeType: PREVIEW_MIME_TYPE,
    dataUrl: `data:${PREVIEW_MIME_TYPE};base64,${buffer.toString("base64")}`
  };
}
