import { join } from "node:path";
import { BRAND_BOT_USER_AGENT } from "../../../packages/core/src/config/brand";
import { extractHtmlSnapshot } from "../../../packages/core/src/extract/html.ts";
import {
  analyzeMarkdownQuality,
  type MarkdownQualityAnalysis,
  type MarkdownQualityIssueType
} from "../../../packages/core/src/extract/markdownCleanup.ts";
import { Defuddle } from "defuddle/node";
import { filterCorpus, loadCorpus } from "./corpus.js";
import { EXPORT_ROOT } from "./paths.js";
import type { CliOptions, CorpusEntry } from "./types.js";
import {
  ensureDir,
  normalizeForComparison,
  runWithConcurrency,
  safeFileName,
  summarizeExcerpt,
  timestampSlug,
  writeJson,
  writeText
} from "./utils.js";

type SharedFetchStatus = "passed" | "failed";
type LaneStatus = "passed" | "failed";
type BenchmarkLane = "current" | "defuddle";
type BenchmarkSeverity =
  | "exact_match"
  | "cosmetic_drift"
  | "substantive_divergence"
  | "fetch_failure"
  | "lane_failure"
  | "cleanup_issue";
type LaneWinner = BenchmarkLane | "tie" | "unavailable";

interface SharedFetchResult {
  status: SharedFetchStatus;
  sourceUrl: string;
  finalUrl?: string;
  html?: string;
  htmlBytes?: number;
  durationMs: number;
  statusCode?: number;
  contentType?: string | null;
  errorMessage?: string;
}

interface BenchmarkLaneResult {
  lane: BenchmarkLane;
  status: LaneStatus;
  sourceUrl: string;
  title?: string;
  rawMarkdown?: string;
  cleanedMarkdown?: string;
  rawAnalysis?: MarkdownQualityAnalysis;
  cleanedAnalysis?: MarkdownQualityAnalysis;
  durationMs: number;
  errorMessage?: string;
  parseTimeMs?: number;
  extractorType?: string;
  wordCount?: number;
  warningCount?: number;
}

interface DefuddleComparisonResult {
  entry: CorpusEntry;
  fetchResult: SharedFetchResult;
  currentResult?: BenchmarkLaneResult;
  defuddleResult?: BenchmarkLaneResult;
  severity: BenchmarkSeverity;
  normalizedMatch: boolean;
  diffSummary: string;
  rerunRecommended: boolean;
  rawIssueWinner: LaneWinner;
}

interface DefuddleComparisonSummary {
  totalTargets: number;
  fetchPassed: number;
  fetchFailed: number;
  currentPassed: number;
  currentFailed: number;
  defuddlePassed: number;
  defuddleFailed: number;
  exactMatches: number;
  normalizedMatches: number;
  narratableCounts: Record<BenchmarkLane, number>;
  rawIssueTotals: Record<BenchmarkLane, number>;
  cleanedIssueTotals: Record<BenchmarkLane, number>;
  rawIssueWins: Record<LaneWinner, number>;
  severityCounts: Record<BenchmarkSeverity, number>;
}

function issueCountTotal(analysis?: MarkdownQualityAnalysis): number {
  if (!analysis) {
    return 0;
  }
  return Object.values(analysis.issueCounts).reduce((sum, value) => sum + value, 0);
}

function cleanedIssueTypes(result?: BenchmarkLaneResult): MarkdownQualityIssueType[] {
  return result?.cleanedAnalysis?.issues.map((issue) => issue.type) || [];
}

function firstParagraphDifference(leftLabel: string, left: string, rightLabel: string, right: string): string {
  const leftParagraphs = left.split(/\n{2,}/g).map((value) => value.trim()).filter(Boolean);
  const rightParagraphs = right.split(/\n{2,}/g).map((value) => value.trim()).filter(Boolean);
  const length = Math.max(leftParagraphs.length, rightParagraphs.length);
  for (let index = 0; index < length; index += 1) {
    const a = leftParagraphs[index] || "";
    const b = rightParagraphs[index] || "";
    if (normalizeForComparison(a) !== normalizeForComparison(b)) {
      return `Paragraph ${index + 1} differs. ${leftLabel}='${summarizeExcerpt(a)}' ${rightLabel}='${summarizeExcerpt(b)}'`;
    }
  }
  return "The cleaned markdown differs after normalization, but no single paragraph stood out.";
}

function compareIssueTotals(currentResult?: BenchmarkLaneResult, defuddleResult?: BenchmarkLaneResult): LaneWinner {
  if (currentResult?.status !== "passed" || defuddleResult?.status !== "passed") {
    return "unavailable";
  }

  const currentTotal = issueCountTotal(currentResult.rawAnalysis);
  const defuddleTotal = issueCountTotal(defuddleResult.rawAnalysis);
  if (currentTotal === defuddleTotal) {
    return "tie";
  }
  return currentTotal < defuddleTotal ? "current" : "defuddle";
}

export function classifyDefuddleComparison(
  fetchResult: SharedFetchResult,
  currentResult?: BenchmarkLaneResult,
  defuddleResult?: BenchmarkLaneResult
): Omit<DefuddleComparisonResult, "entry" | "fetchResult" | "currentResult" | "defuddleResult" | "rawIssueWinner"> {
  if (fetchResult.status === "failed") {
    return {
      severity: "fetch_failure",
      normalizedMatch: false,
      diffSummary: fetchResult.errorMessage || "Shared fetch failed before either extractor could run.",
      rerunRecommended: true
    };
  }

  if ((currentResult && currentResult.status === "failed") || (defuddleResult && defuddleResult.status === "failed")) {
    return {
      severity: "lane_failure",
      normalizedMatch: false,
      diffSummary: "One or both extractors failed after the shared fetch.",
      rerunRecommended: true
    };
  }

  const remainingIssues = [...cleanedIssueTypes(currentResult), ...cleanedIssueTypes(defuddleResult)];
  if (remainingIssues.length > 0) {
    return {
      severity: "cleanup_issue",
      normalizedMatch: false,
      diffSummary: `Post-cleanup issues remain: ${Array.from(new Set(remainingIssues)).join(", ")}.`,
      rerunRecommended: true
    };
  }

  const currentMarkdown = currentResult?.cleanedMarkdown || "";
  const defuddleMarkdown = defuddleResult?.cleanedMarkdown || "";
  const normalizedMatch = normalizeForComparison(currentMarkdown) === normalizeForComparison(defuddleMarkdown);

  if (currentMarkdown === defuddleMarkdown) {
    return {
      severity: "exact_match",
      normalizedMatch: true,
      diffSummary: "Cleaned markdown matches exactly.",
      rerunRecommended: false
    };
  }

  if (normalizedMatch) {
    return {
      severity: "cosmetic_drift",
      normalizedMatch: true,
      diffSummary: "Normalized cleaned markdown matches; differences are cosmetic.",
      rerunRecommended: false
    };
  }

  return {
    severity: "substantive_divergence",
    normalizedMatch: false,
    diffSummary: firstParagraphDifference("current", currentMarkdown, "defuddle", defuddleMarkdown),
    rerunRecommended: true
  };
}

export function buildDefuddleComparisonSummary(results: DefuddleComparisonResult[]): DefuddleComparisonSummary {
  return results.reduce<DefuddleComparisonSummary>(
    (summary, result) => {
      summary.totalTargets += 1;
      summary.severityCounts[result.severity] += 1;

      if (result.fetchResult.status === "passed") {
        summary.fetchPassed += 1;
      } else {
        summary.fetchFailed += 1;
      }

      if (result.currentResult?.status === "passed") {
        summary.currentPassed += 1;
        summary.narratableCounts.current += result.currentResult.cleanedAnalysis?.hasNarratableText ? 1 : 0;
        summary.rawIssueTotals.current += issueCountTotal(result.currentResult.rawAnalysis);
        summary.cleanedIssueTotals.current += issueCountTotal(result.currentResult.cleanedAnalysis);
      } else if (result.currentResult?.status === "failed") {
        summary.currentFailed += 1;
      }

      if (result.defuddleResult?.status === "passed") {
        summary.defuddlePassed += 1;
        summary.narratableCounts.defuddle += result.defuddleResult.cleanedAnalysis?.hasNarratableText ? 1 : 0;
        summary.rawIssueTotals.defuddle += issueCountTotal(result.defuddleResult.rawAnalysis);
        summary.cleanedIssueTotals.defuddle += issueCountTotal(result.defuddleResult.cleanedAnalysis);
      } else if (result.defuddleResult?.status === "failed") {
        summary.defuddleFailed += 1;
      }

      if (result.severity === "exact_match") {
        summary.exactMatches += 1;
      }
      if (result.normalizedMatch) {
        summary.normalizedMatches += 1;
      }

      summary.rawIssueWins[result.rawIssueWinner] += 1;
      return summary;
    },
    {
      totalTargets: 0,
      fetchPassed: 0,
      fetchFailed: 0,
      currentPassed: 0,
      currentFailed: 0,
      defuddlePassed: 0,
      defuddleFailed: 0,
      exactMatches: 0,
      normalizedMatches: 0,
      narratableCounts: {
        current: 0,
        defuddle: 0
      },
      rawIssueTotals: {
        current: 0,
        defuddle: 0
      },
      cleanedIssueTotals: {
        current: 0,
        defuddle: 0
      },
      rawIssueWins: {
        current: 0,
        defuddle: 0,
        tie: 0,
        unavailable: 0
      },
      severityCounts: {
        exact_match: 0,
        cosmetic_drift: 0,
        substantive_divergence: 0,
        fetch_failure: 0,
        lane_failure: 0,
        cleanup_issue: 0
      }
    }
  );
}

async function fetchSharedHtml(entry: CorpusEntry): Promise<SharedFetchResult> {
  const startedAt = Date.now();
  try {
    const response = await fetch(entry.url, {
      headers: {
        "user-agent": BRAND_BOT_USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: AbortSignal.timeout(60_000)
    });

    if (!response.ok) {
      return {
        status: "failed",
        sourceUrl: entry.url,
        durationMs: Date.now() - startedAt,
        statusCode: response.status,
        contentType: response.headers.get("content-type"),
        errorMessage: `Shared fetch failed with HTTP ${response.status}.`
      };
    }

    const html = await response.text();
    if (!html.trim()) {
      return {
        status: "failed",
        sourceUrl: entry.url,
        durationMs: Date.now() - startedAt,
        statusCode: response.status,
        contentType: response.headers.get("content-type"),
        errorMessage: "Shared fetch returned an empty response body."
      };
    }

    return {
      status: "passed",
      sourceUrl: entry.url,
      finalUrl: response.url || entry.url,
      html,
      htmlBytes: Buffer.byteLength(html, "utf8"),
      durationMs: Date.now() - startedAt,
      statusCode: response.status,
      contentType: response.headers.get("content-type")
    };
  } catch (error) {
    return {
      status: "failed",
      sourceUrl: entry.url,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}

async function runCurrentLane(fetchResult: SharedFetchResult): Promise<BenchmarkLaneResult> {
  const startedAt = Date.now();
  try {
    const extracted = extractHtmlSnapshot({
      html: fetchResult.html || "",
      url: fetchResult.finalUrl || fetchResult.sourceUrl
    });
    const rawAnalysis = analyzeMarkdownQuality(extracted.markdown);
    const cleanedAnalysis = analyzeMarkdownQuality(rawAnalysis.cleanedMarkdown);
    return {
      lane: "current",
      status: "passed",
      sourceUrl: fetchResult.finalUrl || fetchResult.sourceUrl,
      title: extracted.title,
      rawMarkdown: extracted.markdown,
      cleanedMarkdown: rawAnalysis.cleanedMarkdown,
      rawAnalysis,
      cleanedAnalysis,
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      lane: "current",
      status: "failed",
      sourceUrl: fetchResult.finalUrl || fetchResult.sourceUrl,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}

async function runDefuddleLane(fetchResult: SharedFetchResult): Promise<BenchmarkLaneResult> {
  const startedAt = Date.now();
  try {
    const suppressedWarnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      suppressedWarnings.push(args.map((value) => String(value)).join(" "));
    };

    let result;
    try {
      result = await Defuddle(fetchResult.html || "", fetchResult.finalUrl || fetchResult.sourceUrl, {
        markdown: true,
        useAsync: false,
        includeReplies: false
      });
    } finally {
      console.warn = originalWarn;
    }

    const markdown = result.content?.trim();
    if (!markdown) {
      throw new Error("defuddle returned empty markdown.");
    }

    const rawAnalysis = analyzeMarkdownQuality(markdown);
    const cleanedAnalysis = analyzeMarkdownQuality(rawAnalysis.cleanedMarkdown);
    return {
      lane: "defuddle",
      status: "passed",
      sourceUrl: fetchResult.finalUrl || fetchResult.sourceUrl,
      title: result.title,
      rawMarkdown: markdown,
      cleanedMarkdown: rawAnalysis.cleanedMarkdown,
      rawAnalysis,
      cleanedAnalysis,
      durationMs: Date.now() - startedAt,
      parseTimeMs: result.parseTime,
      extractorType: result.extractorType,
      wordCount: result.wordCount,
      warningCount: suppressedWarnings.length
    };
  } catch (error) {
    return {
      lane: "defuddle",
      status: "failed",
      sourceUrl: fetchResult.finalUrl || fetchResult.sourceUrl,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}

function groupIssues(results: DefuddleComparisonResult[]): Record<MarkdownQualityIssueType, string[]> {
  const grouped: Record<MarkdownQualityIssueType, string[]> = {
    residual_url: [],
    leading_metadata: [],
    image_wrapper: [],
    table_markup: [],
    footer_legal: [],
    share_or_comment_noise: [],
    language_footer: [],
    low_signal_after_cleanup: []
  };

  for (const result of results) {
    for (const [lane, laneResult] of [
      ["current", result.currentResult],
      ["defuddle", result.defuddleResult]
    ] as const) {
      if (!laneResult?.rawAnalysis) {
        continue;
      }
      for (const issue of laneResult.rawAnalysis.issues) {
        grouped[issue.type].push(`- ${lane} · ${result.entry.id} · ${issue.excerpt}`);
      }
    }
  }

  return grouped;
}

async function writeTargetArtifacts(reportDir: string, result: DefuddleComparisonResult): Promise<void> {
  const targetDir = join(reportDir, "targets", safeFileName(result.entry.id));
  await ensureDir(targetDir);

  await writeJson(join(targetDir, "comparison.json"), {
    entry: result.entry,
    fetch: {
      status: result.fetchResult.status,
      finalUrl: result.fetchResult.finalUrl || null,
      durationMs: result.fetchResult.durationMs,
      htmlBytes: result.fetchResult.htmlBytes || null,
      statusCode: result.fetchResult.statusCode || null,
      contentType: result.fetchResult.contentType || null,
      errorMessage: result.fetchResult.errorMessage || null
    },
    severity: result.severity,
    normalizedMatch: result.normalizedMatch,
    diffSummary: result.diffSummary,
    rerunRecommended: result.rerunRecommended,
    rawIssueWinner: result.rawIssueWinner,
    current: result.currentResult
      ? {
          status: result.currentResult.status,
          title: result.currentResult.title,
          durationMs: result.currentResult.durationMs,
          errorMessage: result.currentResult.errorMessage || null,
          issueCounts: result.currentResult.rawAnalysis?.issueCounts || null,
          cleanedIssueCounts: result.currentResult.cleanedAnalysis?.issueCounts || null
        }
      : null,
    defuddle: result.defuddleResult
      ? {
          status: result.defuddleResult.status,
      title: result.defuddleResult.title,
      durationMs: result.defuddleResult.durationMs,
      parseTimeMs: result.defuddleResult.parseTimeMs || null,
      extractorType: result.defuddleResult.extractorType || null,
      wordCount: result.defuddleResult.wordCount || null,
      warningCount: result.defuddleResult.warningCount || 0,
      errorMessage: result.defuddleResult.errorMessage || null,
      issueCounts: result.defuddleResult.rawAnalysis?.issueCounts || null,
      cleanedIssueCounts: result.defuddleResult.cleanedAnalysis?.issueCounts || null
        }
      : null
  });

  if (result.fetchResult.html) {
    await writeText(join(targetDir, "shared.html"), result.fetchResult.html);
  }
  if (result.currentResult?.rawMarkdown) {
    await writeText(join(targetDir, "current.raw.md"), `${result.currentResult.rawMarkdown}\n`);
  }
  if (result.currentResult?.cleanedMarkdown) {
    await writeText(join(targetDir, "current.cleaned.md"), `${result.currentResult.cleanedMarkdown}\n`);
  }
  if (result.defuddleResult?.rawMarkdown) {
    await writeText(join(targetDir, "defuddle.raw.md"), `${result.defuddleResult.rawMarkdown}\n`);
  }
  if (result.defuddleResult?.cleanedMarkdown) {
    await writeText(join(targetDir, "defuddle.cleaned.md"), `${result.defuddleResult.cleanedMarkdown}\n`);
  }
}

async function writeDefuddleComparisonReports(
  results: DefuddleComparisonResult[],
  summary: DefuddleComparisonSummary,
  reportDir: string
): Promise<void> {
  const rerunIds = results.filter((result) => result.rerunRecommended).map((result) => result.entry.id);
  const grouped = groupIssues(results);
  const flaggedResults = results.filter((result) => result.severity !== "exact_match" && result.severity !== "cosmetic_drift");

  const serializableResults = results.map((result) => ({
    entry: result.entry,
    severity: result.severity,
    normalizedMatch: result.normalizedMatch,
    diffSummary: result.diffSummary,
    rerunRecommended: result.rerunRecommended,
    rawIssueWinner: result.rawIssueWinner,
    fetchResult: {
      status: result.fetchResult.status,
      sourceUrl: result.fetchResult.sourceUrl,
      finalUrl: result.fetchResult.finalUrl || null,
      htmlBytes: result.fetchResult.htmlBytes || null,
      durationMs: result.fetchResult.durationMs,
      statusCode: result.fetchResult.statusCode || null,
      contentType: result.fetchResult.contentType || null,
      errorMessage: result.fetchResult.errorMessage || null
    },
    currentResult: result.currentResult
      ? {
          status: result.currentResult.status,
          sourceUrl: result.currentResult.sourceUrl,
          title: result.currentResult.title,
          durationMs: result.currentResult.durationMs,
          errorMessage: result.currentResult.errorMessage || null,
          issueCounts: result.currentResult.rawAnalysis?.issueCounts || null,
          cleanedIssueCounts: result.currentResult.cleanedAnalysis?.issueCounts || null,
          hasNarratableText: result.currentResult.cleanedAnalysis?.hasNarratableText || false
        }
      : null,
    defuddleResult: result.defuddleResult
      ? {
          status: result.defuddleResult.status,
          sourceUrl: result.defuddleResult.sourceUrl,
          title: result.defuddleResult.title,
          durationMs: result.defuddleResult.durationMs,
          parseTimeMs: result.defuddleResult.parseTimeMs || null,
          extractorType: result.defuddleResult.extractorType || null,
          wordCount: result.defuddleResult.wordCount || null,
          warningCount: result.defuddleResult.warningCount || 0,
          errorMessage: result.defuddleResult.errorMessage || null,
          issueCounts: result.defuddleResult.rawAnalysis?.issueCounts || null,
          cleanedIssueCounts: result.defuddleResult.cleanedAnalysis?.issueCounts || null,
          hasNarratableText: result.defuddleResult.cleanedAnalysis?.hasNarratableText || false
        }
      : null
  }));

  const summaryLines = [
    "# Current vs Defuddle Extraction Summary",
    "",
    "_This benchmark fetches each URL once, then runs both markdown extractors on the same returned HTML. It does not measure production fetch hardening or SSRF controls._",
    "",
    `- Targets: ${summary.totalTargets}`,
    `- Shared fetch passed: ${summary.fetchPassed}`,
    `- Shared fetch failed: ${summary.fetchFailed}`,
    `- Current extractor passed: ${summary.currentPassed}`,
    `- Current extractor failed: ${summary.currentFailed}`,
    `- Defuddle passed: ${summary.defuddlePassed}`,
    `- Defuddle failed: ${summary.defuddleFailed}`,
    `- Exact cleaned matches: ${summary.exactMatches}`,
    `- Normalized cleaned matches: ${summary.normalizedMatches}`,
    "",
    "## Raw Issue Wins",
    `- current: ${summary.rawIssueWins.current}`,
    `- defuddle: ${summary.rawIssueWins.defuddle}`,
    `- tie: ${summary.rawIssueWins.tie}`,
    `- unavailable: ${summary.rawIssueWins.unavailable}`,
    "",
    "## Narratable Outputs",
    `- current: ${summary.narratableCounts.current}`,
    `- defuddle: ${summary.narratableCounts.defuddle}`,
    "",
    "## Total Issue Counts",
    `- current raw issues: ${summary.rawIssueTotals.current}`,
    `- defuddle raw issues: ${summary.rawIssueTotals.defuddle}`,
    `- current cleaned issues: ${summary.cleanedIssueTotals.current}`,
    `- defuddle cleaned issues: ${summary.cleanedIssueTotals.defuddle}`,
    "",
    "## Severity Counts",
    ...(Object.entries(summary.severityCounts) as Array<[BenchmarkSeverity, number]>).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Rerun Recommended",
    ...(rerunIds.length > 0 ? rerunIds.map((id) => `- ${id}`) : ["- None"])
  ];

  const patternLines = [
    "# Current vs Defuddle Extraction Patterns",
    "",
    ...(Object.keys(grouped) as MarkdownQualityIssueType[]).flatMap((key) => [`## ${key}`, ...(grouped[key].length > 0 ? grouped[key] : ["- None"]), ""])
  ];

  const excerptLines = [
    "# Current vs Defuddle Flagged Results",
    "",
    ...flaggedResults.flatMap((result) => [
      `## ${result.entry.id}`,
      `- url: ${result.entry.url}`,
      `- severity: ${result.severity}`,
      `- raw_issue_winner: ${result.rawIssueWinner}`,
      `- summary: ${result.diffSummary}`,
      ...(result.fetchResult.errorMessage ? [`- fetch_error: ${result.fetchResult.errorMessage}`] : []),
      ...(result.currentResult?.errorMessage ? [`- current_error: ${result.currentResult.errorMessage}`] : []),
      ...(result.defuddleResult?.errorMessage ? [`- defuddle_error: ${result.defuddleResult.errorMessage}`] : []),
      ""
    ])
  ];

  await writeJson(join(reportDir, "results.json"), {
    summary,
    results: serializableResults
  });
  await writeText(join(reportDir, "summary.md"), `${summaryLines.join("\n")}\n`);
  await writeText(join(reportDir, "patterns.md"), `${patternLines.join("\n")}\n`);
  await writeText(join(reportDir, "flagged.md"), `${excerptLines.join("\n")}\n`);
  await writeText(join(reportDir, "rerun-ids.txt"), `${rerunIds.join("\n")}${rerunIds.length > 0 ? "\n" : ""}`);
}

async function runEntry(entry: CorpusEntry): Promise<DefuddleComparisonResult> {
  const fetchResult = await fetchSharedHtml(entry);
  if (fetchResult.status === "failed") {
    return {
      entry,
      fetchResult,
      ...classifyDefuddleComparison(fetchResult),
      rawIssueWinner: "unavailable"
    };
  }

  const [currentResult, defuddleResult] = await Promise.all([runCurrentLane(fetchResult), runDefuddleLane(fetchResult)]);
  return {
    entry,
    fetchResult,
    currentResult,
    defuddleResult,
    ...classifyDefuddleComparison(fetchResult, currentResult, defuddleResult),
    rawIssueWinner: compareIssueTotals(currentResult, defuddleResult)
  };
}

export async function runDefuddleComparison(options: CliOptions): Promise<{ reportDir: string; results: DefuddleComparisonResult[] }> {
  const corpus = filterCorpus(await loadCorpus(options.inputPath), options);
  if (corpus.length === 0) {
    throw new Error("No corpus entries matched the supplied filters.");
  }

  const reportDir = join(EXPORT_ROOT, timestampSlug(), "defuddle");
  await ensureDir(join(reportDir, "targets"));

  const results = await runWithConcurrency(corpus, options.concurrencyUrl, async (entry) => await runEntry(entry));
  for (const result of results) {
    await writeTargetArtifacts(reportDir, result);
  }

  await writeDefuddleComparisonReports(results, buildDefuddleComparisonSummary(results), reportDir);
  return {
    reportDir,
    results
  };
}
