import {
  AppError,
  KokoroTtsProvider,
  type TtsProvider,
  type TtsProviderId
} from "@listenlater/core";
import { workerEnv } from "./env.js";
import { errorCodes } from "@listenlater/core";

export function makeTtsProvider(selection: { providerId: TtsProviderId }): TtsProvider {
  if (selection.providerId !== "kokoro") {
    throw new AppError(errorCodes.TTS_FAILED, "Only Kokoro-82M is enabled for narration.", 400);
  }

  return new KokoroTtsProvider(workerEnv.pythonTtsUrl, workerEnv.pythonTtsTimeoutMs);
}
