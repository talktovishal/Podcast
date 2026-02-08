import {
  AppError,
  KokoroTtsProvider,
  MacSayTtsProvider,
  MeloTtsProvider,
  OpenAiTtsProvider,
  type TtsProvider,
  type TtsProviderId
} from "@listenlater/core";
import { workerEnv } from "./env.js";
import { errorCodes } from "@listenlater/core";

export function makeTtsProvider(selection: { providerId: TtsProviderId }): TtsProvider {
  switch (selection.providerId) {
    case "kokoro":
      return new KokoroTtsProvider(workerEnv.pythonTtsUrl, workerEnv.pythonTtsTimeoutMs);
    case "melo":
      return new MeloTtsProvider(workerEnv.pythonTtsUrl, workerEnv.pythonTtsTimeoutMs);
    case "openai":
      if (!workerEnv.openAiApiKey) {
        throw new AppError(errorCodes.TTS_FAILED, "OpenAI TTS is not configured for this environment.", 400);
      }
      return new OpenAiTtsProvider(workerEnv.openAiApiKey);
    case "mac-say":
      return new MacSayTtsProvider();
    default:
      return new MacSayTtsProvider();
  }
}
