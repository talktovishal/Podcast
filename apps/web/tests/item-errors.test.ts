import assert from "node:assert/strict";
import test from "node:test";
import { normalizeItemErrorMessage, recommendsChromeExtensionCapture } from "../src/lib/item-errors";

test("recommends chrome extension capture only for the targeted blocked-site message", () => {
  assert.equal(
    recommendsChromeExtensionCapture(
      "This site blocked server-side access. If the page opens in your browser, capture it with the Chrome extension instead of submitting the URL directly."
    ),
    true
  );
  assert.equal(recommendsChromeExtensionCapture("The source site timed out while fetching content. Retry or try another URL."), false);
});

test("normalizes stored provider-specific audio failures to a generic message", () => {
  assert.equal(normalizeItemErrorMessage("Python kokoro provider failed (500)."), "Audio processing failed. Please retry.");
  assert.equal(
    normalizeItemErrorMessage("Could not synthesize audio with kokoro. Ensure python-tts service is running."),
    "Audio processing failed. Please retry."
  );
  assert.equal(normalizeItemErrorMessage("Processing exceeded the 45-minute safety limit and was stopped. Please retry."), "Processing exceeded the 45-minute safety limit and was stopped. Please retry.");
});
