import assert from "node:assert/strict";
import test from "node:test";
import { buildProductionAuditSummary } from "../src/report.js";
import { classifyGeneratedContent } from "../src/prod-audit.js";
import type { ProductionAuditEntry } from "../src/types.js";

test("classifyGeneratedContent marks placeholder summaries as stub output", () => {
  const result = classifyGeneratedContent(`# Manual summary

Generated from 1 source item(s), target length 15 minutes (2100 words).

## Why it matters

- This placeholder summary uses the deterministic stub provider.`);

  assert.equal(result.classification, "stub");
  assert.equal(result.notes.includes("stub_output"), true);
});

test("classifyGeneratedContent marks heading-only outputs as trivial", () => {
  const result = classifyGeneratedContent("# Manual studio run");
  assert.equal(result.classification, "trivial");
  assert.equal(result.notes.includes("trivial_output"), true);
});

test("classifyGeneratedContent suppresses low-signal issues for short description surfaces", () => {
  const result = classifyGeneratedContent("Quick summary card for playback.", { suppressLowSignal: true });
  assert.equal(result.issueCounts.low_signal_after_cleanup, 0);
  assert.equal(result.issues.some((issue) => issue.type === "low_signal_after_cleanup"), false);
});

test("buildProductionAuditSummary tracks cleanup and stub counts separately", () => {
  const entries: ProductionAuditEntry[] = [
    {
      kind: "summary_markdown",
      path: "summaries/user/run/summary.md",
      issueCounts: {
        residual_url: 1,
        leading_metadata: 0,
        image_wrapper: 0,
        footer_legal: 0,
        share_or_comment_noise: 0,
        language_footer: 0,
        low_signal_after_cleanup: 0
      },
      issues: [{ type: "residual_url", excerpt: "https://example.com", lineNumber: 3, message: "Contains URL." }],
      cleanedMarkdown: "Body",
      hasNarratableText: true,
      id: "run-1",
      userId: "user-1",
      title: "Summary",
      storageKey: "summaries/user/run/summary.md",
      createdAt: "2026-04-04T12:00:00.000Z",
      publishedAt: "2026-04-04T12:05:00.000Z",
      classification: "stub",
      notes: ["stub_output"],
      fetchError: null
    },
    {
      kind: "episode_description",
      path: "episode/ep-1#description",
      issueCounts: {
        residual_url: 0,
        leading_metadata: 0,
        image_wrapper: 0,
        footer_legal: 0,
        share_or_comment_noise: 0,
        language_footer: 0,
        low_signal_after_cleanup: 0
      },
      issues: [],
      cleanedMarkdown: "Playback summary",
      hasNarratableText: true,
      id: "ep-1",
      userId: "user-1",
      title: "Episode",
      storageKey: null,
      createdAt: "2026-04-04T12:00:00.000Z",
      publishedAt: "2026-04-04T12:05:00.000Z",
      classification: "normal",
      notes: [],
      fetchError: null
    }
  ];

  const summary = buildProductionAuditSummary(entries);
  assert.equal(summary.totalEntries, 2);
  assert.equal(summary.entriesWithIssues, 1);
  assert.equal(summary.stubEntries, 1);
  assert.equal(summary.countsByKind.summary_markdown, 1);
  assert.equal(summary.countsByKind.episode_description, 1);
  assert.equal(summary.issueCounts.residual_url, 1);
});
