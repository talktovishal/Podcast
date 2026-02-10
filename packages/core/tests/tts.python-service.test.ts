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

  try {
    await assert.rejects(
      provider.synthesizeToFile({
        text: "hello",
        voice: "af_heart",
        format: "m4a",
        outPath: "/tmp/unused.m4a"
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

