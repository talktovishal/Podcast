import {
  AppError,
  KokoroTtsProvider,
  type TtsProvider,
  type TtsProviderId
} from "@articlepod/core";
import { workerEnv } from "./env.js";
import { errorCodes } from "@articlepod/core";

type TtsRuntimeSelection = {
  lane: "local" | "overflow-external";
  pythonTtsUrl: string;
  pythonTtsTimeoutMs: number;
  pythonTtsSecret: string | undefined;
};

function resolveKokoroRuntimeSelection(): TtsRuntimeSelection {
  if (workerEnv.workerRole === "overflow" && workerEnv.overflowPythonTtsUrl) {
    return {
      lane: "overflow-external",
      pythonTtsUrl: workerEnv.overflowPythonTtsUrl,
      pythonTtsTimeoutMs: workerEnv.overflowPythonTtsTimeoutMs,
      pythonTtsSecret: workerEnv.overflowPythonTtsSecret || workerEnv.pythonTtsSecret
    };
  }

  return {
    lane: "local",
    pythonTtsUrl: workerEnv.pythonTtsUrl,
    pythonTtsTimeoutMs: workerEnv.pythonTtsTimeoutMs,
    pythonTtsSecret: workerEnv.pythonTtsSecret
  };
}

export function describeTtsRuntime() {
  const runtime = resolveKokoroRuntimeSelection();
  return {
    lane: runtime.lane,
    pythonTtsUrl: runtime.pythonTtsUrl
  };
}

export function makeTtsProvider(selection: { providerId: TtsProviderId }): TtsProvider {
  if (selection.providerId !== "kokoro") {
    throw new AppError(errorCodes.TTS_FAILED, "Only Kokoro-82M is enabled for narration.", 400);
  }

  const runtime = resolveKokoroRuntimeSelection();
  return new KokoroTtsProvider(runtime.pythonTtsUrl, runtime.pythonTtsTimeoutMs, runtime.pythonTtsSecret);
}
