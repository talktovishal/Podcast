import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExtractionLogEntries } from "../src/lib/demo-diagnostics";

test("normalizeExtractionLogEntries keeps valid entries", () => {
  const result = normalizeExtractionLogEntries([
    {
      at: "2026-02-08T00:00:00.000Z",
      stage: "extract:url",
      message: "Fetched source",
      details: { bytes: 1234 }
    }
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.stage, "extract:url");
  assert.deepEqual(result[0]?.details, { bytes: 1234 });
});

test("normalizeExtractionLogEntries drops malformed entries", () => {
  const result = normalizeExtractionLogEntries([
    null,
    42,
    { stage: "extract:url", message: "missing timestamp" },
    { at: "2026-02-08T00:00:00.000Z", stage: "extract:url", message: "ok" }
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.message, "ok");
});
