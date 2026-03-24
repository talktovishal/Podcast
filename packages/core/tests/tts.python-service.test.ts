import assert from "node:assert/strict";
import test from "node:test";
import { AppError, errorCodes } from "../src/errors/codes";
import { PythonModelTtsProvider } from "../src/tts/pythonService";

test("python service surfaces structured detail as safe string", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        detail: [{ loc: ["body", "text"], msg: "String should have at most 12000 characters", type: "string_too_long" }]
      }),
      { status: 422, headers: { "content-type": "application/json" } }
    )) as typeof fetch;

  const provider = new PythonModelTtsProvider({
    providerId: "kokoro",
    baseUrl: "http://127.0.0.1:8010"
  });
  assert.equal(provider.outputFormat, "mp3");

  try {
    await assert.rejects(
      provider.synthesizeToFile({
        text: "hello",
        voice: "af_heart",
        format: "mp3",
        outPath: "/tmp/unused.mp3"
      }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, errorCodes.TTS_FAILED);
        assert.equal(error.userMessage, "body.text: String should have at most 12000 characters");
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("python service maps timeout errors to actionable guidance", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const error = new Error("The operation was aborted due to timeout.");
    error.name = "TimeoutError";
    throw error;
  }) as typeof fetch;

  const provider = new PythonModelTtsProvider({
    providerId: "kokoro",
    baseUrl: "http://127.0.0.1:8010",
    timeoutMs: 120_000
  });

  try {
    await assert.rejects(
      provider.synthesizeToFile({
        text: "x".repeat(1_750),
        voice: "af_heart",
        format: "mp3",
        outPath: "/tmp/unused.mp3"
      }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, errorCodes.TTS_FAILED);
        assert.match(
          error.userMessage,
          /^Kokoro synthesis timed out after \d+s\. Increase PYTHON_TTS_TIMEOUT_MS or reduce WORKER_TTS_CHUNK_MAX_CHARS\.$/
        );
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
