import assert from "node:assert/strict";
import test from "node:test";
import {
  extensionTokenExchangeSchema,
  sourceTypeValues,
  submitHtmlSnapshotSchema
} from "../src/types/domain";

test("sourceTypeValues includes html_snapshot", () => {
  assert.ok(sourceTypeValues.includes("html_snapshot"));
});

test("submitHtmlSnapshotSchema accepts valid payload", () => {
  const parsed = submitHtmlSnapshotSchema.parse({
    url: "https://example.com/private",
    title: "Captured article",
    html: "<html><body><article><h1>Title</h1><p>Hello world content for narration.</p></article></body></html>",
    capturedAt: "2026-02-08T00:00:00.000Z"
  });

  assert.equal(parsed.url, "https://example.com/private");
  assert.equal(parsed.title, "Captured article");
});

test("submitHtmlSnapshotSchema no longer enforces the old character cap", () => {
  const parsed = submitHtmlSnapshotSchema.parse({
    url: "https://example.com/private",
    html: "x".repeat(2_000_001)
  });

  assert.equal(parsed.html.length, 2_000_001);
});

test("extensionTokenExchangeSchema validates connect code shape", () => {
  const parsed = extensionTokenExchangeSchema.parse({
    connectCode: "abc1234567zxy9876543210",
    label: "Chrome extension"
  });
  assert.equal(parsed.label, "Chrome extension");
});
