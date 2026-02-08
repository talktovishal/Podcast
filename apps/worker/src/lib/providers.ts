import { MacSayTtsProvider, OpenAiTtsProvider, type TtsProvider } from "@listenlater/core";
import { workerEnv } from "./env.js";

export function makeTtsProvider(): TtsProvider {
  if (workerEnv.openAiApiKey) {
    return new OpenAiTtsProvider(workerEnv.openAiApiKey);
  }

  return new MacSayTtsProvider();
}
