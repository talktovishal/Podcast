import assert from "node:assert/strict";
import test from "node:test";
import { errorCodes } from "@listenlater/core";
import { shouldRecommendRetry } from "../src/jobs/processItemJob.js";

test("marks ffmpeg merge failures as non-retryable", () => {
  const retry = shouldRecommendRetry({
    code: errorCodes.TTS_FAILED,
    userMessage: "Could not merge synthesized audio segments. Ensure ffmpeg is installed and available on PATH."
  });

  assert.equal(retry, false);
});

test("keeps transient TTS failures retryable", () => {
  const retry = shouldRecommendRetry({
    code: errorCodes.TTS_FAILED,
    userMessage: "Could not synthesize audio with kokoro. Ensure python-tts service is running."
  });

  assert.equal(retry, true);
});
