import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test from "node:test";
import { AppError, errorCodes, type SynthesizeInput, type TtsProvider } from "@articlepod/core";
import { synthesizeEpisodeAudio } from "../src/jobs/processItemJob.js";
import { getArtifactStorage } from "../src/lib/storage.js";

function makeFakeProvider(synthesize: (input: SynthesizeInput) => Promise<void>): TtsProvider {
  return {
    providerId: "kokoro",
    outputFormat: "mp3",
    synthesizeToFile: synthesize
  };
}

test("synthesizeEpisodeAudio retries retryable TTS segment failures", async () => {
  const key = `tests/tts-retry/${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
  let calls = 0;
  const provider = makeFakeProvider(async ({ outPath }) => {
    calls += 1;
    if (calls === 1) {
      throw new AppError(
        errorCodes.TTS_FAILED,
        "Audio processing is temporarily unavailable. Please retry shortly.",
        502
      );
    }
    await writeFile(outPath, Buffer.from("fake mp3 bytes"));
  });

  try {
    const audio = await synthesizeEpisodeAudio(
      "tts-retry-test",
      [{ text: "Hello from a retryable TTS segment." }],
      { providerId: "kokoro", voice: "af_heart" },
      undefined,
      key,
      "mp3",
      {
        provider,
        maxSegmentAttempts: 2,
        segmentRetryBaseMs: 0
      }
    );

    assert.equal(calls, 2);
    assert.equal(audio.relativePath, key);
    assert.equal(audio.bytes, Buffer.byteLength("fake mp3 bytes"));
  } finally {
    await getArtifactStorage().deleteObject(key).catch(() => undefined);
  }
});

test("synthesizeEpisodeAudio does not retry non-retryable TTS timeout failures", async () => {
  let calls = 0;
  const provider = makeFakeProvider(async () => {
    calls += 1;
    throw new AppError(errorCodes.TTS_FAILED, "Audio processing timed out. Please retry.", 504);
  });

  await assert.rejects(
    () =>
      synthesizeEpisodeAudio(
        "tts-timeout-test",
        [{ text: "This timeout should not be retried." }],
        { providerId: "kokoro", voice: "af_heart" },
        undefined,
        `tests/tts-retry/timeout-${Date.now()}.mp3`,
        "mp3",
        {
          provider,
          maxSegmentAttempts: 3,
          segmentRetryBaseMs: 0
        }
      ),
    (error) => error instanceof AppError && error.status === 504
  );
  assert.equal(calls, 1);
});
