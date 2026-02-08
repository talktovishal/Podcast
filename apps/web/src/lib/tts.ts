import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AppError,
  KokoroTtsProvider,
  MacSayTtsProvider,
  MeloTtsProvider,
  OpenAiTtsProvider,
  errorCodes,
  normalizeTtsSelection,
  type TtsProvider,
  type TtsProviderId
} from "@listenlater/core";
import { env } from "./env";

export type TtsSelection = {
  providerId: TtsProviderId;
  voice: string;
};

export type ProviderAvailability = {
  available: boolean;
  reason?: string;
};

function makeTtsProvider(selection: TtsSelection): TtsProvider {
  switch (selection.providerId) {
    case "kokoro":
      return new KokoroTtsProvider(env.pythonTtsUrl, env.pythonTtsTimeoutMs);
    case "melo":
      return new MeloTtsProvider(env.pythonTtsUrl, env.pythonTtsTimeoutMs);
    case "openai":
      if (!env.openAiApiKey) {
        throw new AppError(errorCodes.TTS_FAILED, "OpenAI TTS is not configured.", 400);
      }
      return new OpenAiTtsProvider(env.openAiApiKey);
    case "mac-say":
      return new MacSayTtsProvider();
    default:
      return new MacSayTtsProvider();
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
  const melo = python.melo;

  return {
    "mac-say": { available: true },
    kokoro: kokoro
      ? { available: Boolean(kokoro.available), reason: kokoro.reason }
      : { available: false, reason: "python-tts service not reachable" },
    melo: melo ? { available: Boolean(melo.available), reason: melo.reason } : { available: false, reason: "python-tts service not reachable" },
    openai: env.openAiApiKey
      ? { available: true }
      : { available: false, reason: "OPENAI_API_KEY is not set" }
  };
}

export async function assertTtsSelectionAvailable(selectionInput: { providerId?: string | null; voice?: string | null }): Promise<TtsSelection> {
  const selection = normalizeTtsSelection(selectionInput);
  const availability = await getTtsProviderAvailability();
  const status = availability[selection.providerId];
  if (!status.available) {
    throw new AppError(
      errorCodes.TTS_FAILED,
      `${selection.providerId} is not available in this environment${status.reason ? ` (${status.reason})` : ""}.`,
      400
    );
  }
  return selection;
}

export async function synthesizePreviewDataUrl(input: {
  providerId?: string | null;
  voice?: string | null;
  text: string;
}): Promise<{ providerId: TtsProviderId; voice: string; mimeType: string; dataUrl: string }> {
  const selection = await assertTtsSelectionAvailable({
    providerId: input.providerId,
    voice: input.voice
  });
  const provider = makeTtsProvider(selection);
  const extension = provider.outputFormat === "mp3" ? "mp3" : "m4a";
  const mimeType = provider.outputFormat === "mp3" ? "audio/mpeg" : "audio/mp4";
  const workspace = await mkdtemp(join(tmpdir(), "listenlater-preview-"));
  const outPath = join(workspace, `preview.${extension}`);

  try {
    await provider.synthesizeToFile({
      text: input.text,
      voice: selection.voice,
      format: provider.outputFormat,
      outPath
    });
    const buffer = await readFile(outPath);
    return {
      providerId: selection.providerId,
      voice: selection.voice,
      mimeType,
      dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
