import assert from "node:assert/strict";
import test from "node:test";
import { AppError, errorCodes } from "@articlepod/core";
import {
  LONG_SOURCE_SUMMARY_NOTICE,
  assertNarrationChunkLimit,
  automaticSummaryTargetLengthMinutes,
  buildLongSourceSummaryNarration,
  buildSourceTooLongError,
  DEFAULT_TTS_MAX_CHUNKS,
  fitLongSourceSummaryNarration,
  shouldSummarizeLongSource
} from "../src/lib/narrationLimits.js";

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

test("detects when long narration should use the automatic summary path", () => {
  assert.equal(shouldSummarizeLongSource(DEFAULT_TTS_MAX_CHUNKS, DEFAULT_TTS_MAX_CHUNKS), false);
  assert.equal(shouldSummarizeLongSource(DEFAULT_TTS_MAX_CHUNKS + 1, DEFAULT_TTS_MAX_CHUNKS), true);
});

test("chooses a summary target that fits the configured chunk budget", () => {
  assert.equal(automaticSummaryTargetLengthMinutes(DEFAULT_TTS_MAX_CHUNKS), 15);
  assert.equal(automaticSummaryTargetLengthMinutes(8), 5);
  assert.match(LONG_SOURCE_SUMMARY_NOTICE, /summarized transcript/i);
});

test("builds summarized narration with the long-source notice", () => {
  const narration = buildLongSourceSummaryNarration("This is the summary.");

  assert.match(narration, /summarized transcript/i);
  assert.match(narration, /This is the summary/);
});

test("clamps verbose summaries so narration fits the configured chunk limit", () => {
  const verboseSummary = Array.from({ length: 100 }, (_, index) => `Sentence ${index + 1} explains an important point.`).join(" ");
  const fitted = fitLongSourceSummaryNarration({
    summaryBody: verboseSummary,
    maxChunks: 3,
    chunkMaxChars: 120
  });

  assert.equal(fitted.wasClamped, true);
  assert.equal(fitted.originalChunkCount > fitted.chunks.length, true);
  assert.equal(fitted.chunks.length <= 3, true);
  assert.match(fitted.narrationText, /summarized transcript/i);
});
