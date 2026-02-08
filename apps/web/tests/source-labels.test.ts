import assert from "node:assert/strict";
import test from "node:test";
import { sourceFallbackLabel, sourceTypeBadgeLabel } from "../src/lib/source-labels";

test("sourceTypeBadgeLabel maps html snapshot to chrome extension", () => {
  assert.equal(sourceTypeBadgeLabel("HTML_SNAPSHOT"), "Chrome extension");
  assert.equal(sourceTypeBadgeLabel("html_snapshot"), "Chrome extension");
});

test("sourceTypeBadgeLabel keeps url and pdf labels clean", () => {
  assert.equal(sourceTypeBadgeLabel("URL"), "URL");
  assert.equal(sourceTypeBadgeLabel("PDF"), "PDF");
});

test("sourceFallbackLabel maps known source types", () => {
  assert.equal(sourceFallbackLabel("URL"), "URL source");
  assert.equal(sourceFallbackLabel("HTML_SNAPSHOT"), "Captured via Chrome extension");
  assert.equal(sourceFallbackLabel("PDF"), "Uploaded PDF");
});

test("source label helpers return unknown source type unchanged", () => {
  assert.equal(sourceTypeBadgeLabel("MANUAL"), "MANUAL");
  assert.equal(sourceFallbackLabel("MANUAL"), "MANUAL");
});
