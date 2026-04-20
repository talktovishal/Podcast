import assert from "node:assert/strict";
import test from "node:test";
import {
  extensionTokenExchangeSchema,
  sourceTypeValues,
  submitHtmlSnapshotSchema,
  submitPdfSchema,
  submitUrlSchema,
  updateItemMetadataSchema
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
  assert.equal(parsed.importance, "LOW");
  assert.deepEqual(parsed.tags, []);
});

test("submitHtmlSnapshotSchema no longer enforces the old character cap", () => {
  const parsed = submitHtmlSnapshotSchema.parse({
    url: "https://example.com/private",
    html: "x".repeat(2_000_001)
  });

  assert.equal(parsed.html.length, 2_000_001);
  assert.equal(parsed.importance, "LOW");
});

test("submitHtmlSnapshotSchema truncates captured page titles instead of rejecting", () => {
  const parsed = submitHtmlSnapshotSchema.parse({
    url: "https://example.com/private",
    title: ` ${"Long captured title ".repeat(20)} `,
    html: "<html><body><article><p>Hello world content for narration.</p></article></body></html>"
  });

  assert.equal(parsed.title?.length, 200);
  assert.equal(parsed.title?.startsWith("Long captured title"), true);
});

test("submitUrlSchema accepts importance aliasing and normalizes comma-separated tags", () => {
  const parsed = submitUrlSchema.parse({
    url: "https://example.com/article",
    priority: "HIGH",
    tags: "Financial, retirement, financial,  Technology "
  });

  assert.equal(parsed.importance, "HIGH");
  assert.deepEqual(parsed.tags, ["financial", "retirement", "technology"]);
});

test("submitPdfSchema accepts canonical importance and tag arrays", () => {
  const parsed = submitPdfSchema.parse({
    title: "Quarterly notes",
    importance: "MEDIUM",
    tags: ["Personal", "planning", "personal"]
  });

  assert.equal(parsed.importance, "MEDIUM");
  assert.deepEqual(parsed.tags, ["personal", "planning"]);
});

test("updateItemMetadataSchema returns canonical importance and tags", () => {
  const parsed = updateItemMetadataSchema.parse({
    priority: "LOW",
    tags: "Personal, financial"
  });

  assert.equal(parsed.importance, "LOW");
  assert.deepEqual(parsed.tags, ["personal", "financial"]);
});

test("extensionTokenExchangeSchema validates connect code shape", () => {
  const parsed = extensionTokenExchangeSchema.parse({
    connectCode: "abc1234567zxy9876543210",
    label: "Chrome extension"
  });
  assert.equal(parsed.label, "Chrome extension");
});
