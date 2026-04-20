import assert from "node:assert/strict";
import test from "node:test";
import { AppError, errorCodes } from "@articlepod/core";
import { assertNarrationChunkLimit, buildSourceTooLongError, DEFAULT_TTS_MAX_CHUNKS } from "../src/lib/narrationLimits.js";

test("allows narration at the default chunk ceiling", () => {
  assert.doesNotThrow(() => assertNarrationChunkLimit(DEFAULT_TTS_MAX_CHUNKS, DEFAULT_TTS_MAX_CHUNKS));
});

test("rejects narration above the configured chunk ceiling", () => {
  assert.throws(
    () => assertNarrationChunkLimit(DEFAULT_TTS_MAX_CHUNKS + 1, DEFAULT_TTS_MAX_CHUNKS),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === errorCodes.SOURCE_TOO_LONG &&
      error.status === 400 &&
      error.userMessage.includes(`limit ${DEFAULT_TTS_MAX_CHUNKS}`)
  );
});

test("formats the source-too-long error with observed and configured chunk counts", () => {
  const error = buildSourceTooLongError(156, DEFAULT_TTS_MAX_CHUNKS);

  assert.equal(error.code, errorCodes.SOURCE_TOO_LONG);
  assert.match(error.userMessage, /156 audio chunks/);
  assert.match(error.userMessage, /limit 24/);
});
