import assert from "node:assert/strict";
import test from "node:test";
import { analyzeMarkdownQuality } from "../../../packages/core/src/extract/markdownCleanup.ts";
import { buildDefuddleComparisonSummary, classifyDefuddleComparison } from "../src/compare-defuddle.js";

test("classifyDefuddleComparison marks shared fetch failures before diffing", () => {
  const diagnostics = classifyDefuddleComparison({
    status: "failed",
    sourceUrl: "https://example.com",
    durationMs: 10,
    errorMessage: "boom"
  });

  assert.equal(diagnostics.severity, "fetch_failure");
  assert.equal(diagnostics.rerunRecommended, true);
});

test("classifyDefuddleComparison marks normalized-only drift as cosmetic", () => {
  const currentCleaned = analyzeMarkdownQuality(
    "## Heading\n\nA paragraph with enough detail to count as narratable article prose for testing, including extra explanation about extraction quality, cleanup expectations, and markdown normalization behavior."
  ).cleanedMarkdown;
  const defuddleCleaned =
    "Heading\n\nA paragraph with enough detail to count as narratable article prose for testing, including extra explanation about extraction quality, cleanup expectations, and markdown normalization behavior.";
  const diagnostics = classifyDefuddleComparison(
    {
      status: "passed",
      sourceUrl: "https://example.com",
      finalUrl: "https://example.com/article",
      html: "<html></html>",
      durationMs: 10
    },
    {
      lane: "current",
      status: "passed",
      sourceUrl: "https://example.com/article",
      cleanedMarkdown: currentCleaned,
      cleanedAnalysis: analyzeMarkdownQuality(currentCleaned),
      durationMs: 10
    },
    {
      lane: "defuddle",
      status: "passed",
      sourceUrl: "https://example.com/article",
      cleanedMarkdown: defuddleCleaned,
      cleanedAnalysis: analyzeMarkdownQuality(defuddleCleaned),
      durationMs: 12
    }
  );

  assert.equal(diagnostics.severity, "cosmetic_drift");
  assert.equal(diagnostics.normalizedMatch, true);
});

test("buildDefuddleComparisonSummary tracks raw issue winners", () => {
  const clean = analyzeMarkdownQuality(
    "A paragraph with enough detail to count as narratable article prose for testing, including extra explanation about extraction quality, cleanup expectations, and markdown normalization behavior."
  );
  const summary = buildDefuddleComparisonSummary([
    {
      entry: {
        id: "alpha",
        url: "https://example.com/article",
        notes: ""
      },
      fetchResult: {
        status: "passed",
        sourceUrl: "https://example.com/article",
        finalUrl: "https://example.com/article",
        html: "<html></html>",
        durationMs: 10
      },
      currentResult: {
        lane: "current",
        status: "passed",
        sourceUrl: "https://example.com/article",
        cleanedMarkdown: clean.cleanedMarkdown,
        cleanedAnalysis: clean,
        rawAnalysis: clean,
        durationMs: 11
      },
      defuddleResult: {
        lane: "defuddle",
        status: "passed",
        sourceUrl: "https://example.com/article",
        cleanedMarkdown: clean.cleanedMarkdown,
        cleanedAnalysis: clean,
        rawAnalysis: clean,
        durationMs: 12
      },
      severity: "exact_match",
      normalizedMatch: true,
      diffSummary: "same",
      rerunRecommended: false,
      rawIssueWinner: "tie"
    }
  ]);

  assert.equal(summary.totalTargets, 1);
  assert.equal(summary.rawIssueWins.tie, 1);
  assert.equal(summary.exactMatches, 1);
});
