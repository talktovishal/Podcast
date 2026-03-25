import assert from "node:assert/strict";
import test from "node:test";
import { errorCodes } from "@articlepod/core";
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

test("marks TTS timeout failures as non-retryable", () => {
  const retry = shouldRecommendRetry({
    code: errorCodes.TTS_FAILED,
    userMessage: "Kokoro synthesis timed out after 205s. Increase PYTHON_TTS_TIMEOUT_MS or reduce WORKER_TTS_CHUNK_MAX_CHARS."
  });

  assert.equal(retry, false);
});

test("marks confirmed site-blocked URL failures as non-retryable", () => {
  const retry = shouldRecommendRetry({
    code: errorCodes.EXTRACTION_FAILED,
    userMessage:
      "This site blocked server-side access. If the page opens in your browser, capture it with the Chrome extension instead of submitting the URL directly."
  });

  assert.equal(retry, false);
});

test("marks processing timeout failures as non-retryable", () => {
  const retry = shouldRecommendRetry({
    code: errorCodes.PROCESSING_TIMEOUT,
    userMessage: "Processing exceeded the 45-minute safety limit and was stopped. Please retry."
  });

  assert.equal(retry, false);
});
