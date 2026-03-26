import assert from "node:assert/strict";
import test from "node:test";
import { analyzeMarkdownQuality } from "../../../packages/core/src/extract/markdownCleanup.ts";
import { classifyComparison } from "../src/diff.js";

test("classifyComparison marks normalized-only changes as cosmetic drift", () => {
  const urlCleaned = analyzeMarkdownQuality(
    "## Heading\n\nA paragraph with enough detail to count as narratable article prose for testing, including extra explanation about extraction quality, cleanup expectations, and markdown normalization behavior."
  ).cleanedMarkdown;
  const extensionCleaned =
    "Heading\n\nA paragraph with enough detail to count as narratable article prose for testing, including extra explanation about extraction quality, cleanup expectations, and markdown normalization behavior.";
  const diagnostics = classifyComparison(
    {
      path: "url",
      status: "passed",
      sourceUrl: "https://example.com/url",
      cleanedMarkdown: urlCleaned,
      cleanedAnalysis: analyzeMarkdownQuality(urlCleaned),
      durationMs: 10
    },
    {
      path: "extension",
      status: "passed",
      sourceUrl: "https://example.com/extension",
      cleanedMarkdown: extensionCleaned,
      cleanedAnalysis: analyzeMarkdownQuality(extensionCleaned),
      durationMs: 11
    }
  );

  assert.equal(diagnostics.severity, "cosmetic_drift");
  assert.equal(diagnostics.normalizedMatch, true);
});

test("classifyComparison marks remaining cleanup issues before diffing", () => {
  const dirty = "[© 2026 Meta](https://www.facebook.com/)\n\n[About](https://www.meta.com/about/)[Privacy](https://www.facebook.com/privacy/)";
  const cleaned = analyzeMarkdownQuality(dirty).cleanedMarkdown;
  const diagnostics = classifyComparison(undefined, {
    path: "extension",
    status: "passed",
    sourceUrl: "https://example.com/extension",
    cleanedMarkdown: cleaned,
    cleanedAnalysis: analyzeMarkdownQuality(cleaned),
    durationMs: 10
  });

  assert.equal(diagnostics.severity, "cleanup_issue");
});
