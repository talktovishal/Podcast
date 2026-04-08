import { join } from "node:path";
import type { MarkdownQualityIssueType } from "../../../packages/core/src/extract/markdownCleanup.ts";
import type {
  ArtifactAuditEntry,
  AuditSummary,
  ComparisonEntryResult,
  CompareSummary,
  PathExtractionResult,
  ProductionAuditEntry,
  ProductionAuditKind,
  ProductionAuditSummary
} from "./types.js";
import { writeJson, writeText } from "./utils.js";

function emptyIssueCounts(): Record<MarkdownQualityIssueType, number> {
  return {
    residual_url: 0,
    leading_metadata: 0,
    image_wrapper: 0,
    table_markup: 0,
    footer_legal: 0,
    share_or_comment_noise: 0,
    language_footer: 0,
    low_signal_after_cleanup: 0
  };
}

function addIssueCounts(
  target: Record<MarkdownQualityIssueType, number>,
  next: Record<MarkdownQualityIssueType, number>
): Record<MarkdownQualityIssueType, number> {
  for (const [key, value] of Object.entries(next) as Array<[MarkdownQualityIssueType, number]>) {
    target[key] += value;
  }
  return target;
}

export function buildAuditSummary(entries: ArtifactAuditEntry[]): AuditSummary {
  return entries.reduce<AuditSummary>(
    (summary, entry) => {
      summary.totalFiles += 1;
      if (entry.kind === "source") {
        summary.sourceFiles += 1;
      } else {
        summary.digestFiles += 1;
      }
      if (entry.issues.length > 0) {
        summary.filesWithIssues += 1;
      }
      if (!entry.hasNarratableText) {
        summary.lowSignalFiles += 1;
      }
      addIssueCounts(summary.issueCounts, entry.issueCounts);
      return summary;
    },
    {
      totalFiles: 0,
      sourceFiles: 0,
      digestFiles: 0,
      filesWithIssues: 0,
      lowSignalFiles: 0,
      issueCounts: emptyIssueCounts()
    }
  );
}

function emptyProductionKindCounts(): Record<ProductionAuditKind, number> {
  return {
    item_source_markdown: 0,
    summary_markdown: 0,
    episode_description: 0,
    summary_episode_description: 0
  };
}

export function buildProductionAuditSummary(entries: ProductionAuditEntry[]): ProductionAuditSummary {
  return entries.reduce<ProductionAuditSummary>(
    (summary, entry) => {
      summary.totalEntries += 1;
      summary.countsByKind[entry.kind] += 1;
      if (entry.issues.length > 0) {
        summary.entriesWithIssues += 1;
      }
      if (entry.classification === "stub") {
        summary.stubEntries += 1;
      }
      if (entry.classification === "trivial") {
        summary.trivialEntries += 1;
      }
      if (entry.classification === "empty") {
        summary.emptyEntries += 1;
      }
      if (entry.fetchError) {
        summary.fetchErrorEntries += 1;
      }
      addIssueCounts(summary.issueCounts, entry.issueCounts);
      return summary;
    },
    {
      totalEntries: 0,
      countsByKind: emptyProductionKindCounts(),
      entriesWithIssues: 0,
      stubEntries: 0,
      trivialEntries: 0,
      emptyEntries: 0,
      fetchErrorEntries: 0,
      issueCounts: emptyIssueCounts()
    }
  );
}

function aggregatePathIssueCounts(result?: PathExtractionResult): Record<MarkdownQualityIssueType, number> {
  return result?.rawAnalysis?.issueCounts || emptyIssueCounts();
}

export function buildCompareSummary(results: ComparisonEntryResult[]): CompareSummary {
  const summary: CompareSummary = {
    totalTargets: results.length,
    urlPassed: 0,
    urlFailed: 0,
    extensionPassed: 0,
    extensionFailed: 0,
    severityCounts: {
      exact_match: 0,
      cosmetic_drift: 0,
      substantive_divergence: 0,
      capture_failure: 0,
      cleanup_issue: 0
    }
  };

  for (const result of results) {
    summary.severityCounts[result.severity] += 1;
    if (result.urlResult?.status === "passed") {
      summary.urlPassed += 1;
    } else if (result.urlResult?.status === "failed") {
      summary.urlFailed += 1;
    }
    if (result.extensionResult?.status === "passed") {
      summary.extensionPassed += 1;
    } else if (result.extensionResult?.status === "failed") {
      summary.extensionFailed += 1;
    }
  }

  return summary;
}

function formatIssueSections(grouped: Record<MarkdownQualityIssueType, string[]>): string[] {
  return (Object.keys(grouped) as MarkdownQualityIssueType[]).flatMap((key) => [
    `## ${key}`,
    ...(grouped[key].length > 0 ? grouped[key] : ["- None"]),
    ""
  ]);
}

export async function writeAuditReports(entries: ArtifactAuditEntry[], summary: AuditSummary, reportDir: string): Promise<void> {
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

  for (const entry of entries) {
    for (const issue of entry.issues) {
      grouped[issue.type].push(`- ${entry.kind} · ${entry.relativePath}:${issue.lineNumber || "?"} · ${issue.excerpt}`);
    }
  }

  const serializable = entries.map((entry) => ({
    kind: entry.kind,
    path: entry.relativePath,
    issueCounts: entry.issueCounts,
    issues: entry.issues,
    hasNarratableText: entry.hasNarratableText
  }));

  const summaryLines = [
    "# Extraction Artifact Audit Summary",
    "",
    `- Total files: ${summary.totalFiles}`,
    `- Source files: ${summary.sourceFiles}`,
    `- Digest files: ${summary.digestFiles}`,
    `- Files with issues: ${summary.filesWithIssues}`,
    `- Low-signal files: ${summary.lowSignalFiles}`,
    "",
    "## Issue Counts",
    ...(Object.entries(summary.issueCounts) as Array<[MarkdownQualityIssueType, number]>).map(([key, value]) => `- ${key}: ${value}`)
  ];

  const excerptsLines = [
    "# Extraction Artifact Audit Excerpts",
    "",
    ...entries
      .filter((entry) => entry.issues.length > 0)
      .flatMap((entry) => [
        `## ${entry.relativePath}`,
        ...entry.issues.map((issue) => `- ${issue.type}: ${issue.excerpt}`),
        ""
      ])
  ];

  await writeJson(join(reportDir, "results.json"), {
    summary,
    results: serializable
  });
  await writeText(join(reportDir, "summary.md"), `${summaryLines.join("\n")}\n`);
  await writeText(join(reportDir, "patterns.md"), `# Extraction Artifact Audit Patterns\n\n${formatIssueSections(grouped).join("\n")}\n`);
  await writeText(join(reportDir, "excerpts.md"), `${excerptsLines.join("\n")}\n`);
}

export async function writeProductionAuditReports(
  entries: ProductionAuditEntry[],
  summary: ProductionAuditSummary,
  reportDir: string,
  context: { resourceGroup: string; tablePrefix: string; days: number; windowStart: string; generatedAt: string }
): Promise<void> {
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

  for (const entry of entries) {
    for (const issue of entry.issues) {
      grouped[issue.type].push(`- ${entry.kind} · ${entry.path}:${issue.lineNumber || "?"} · ${issue.excerpt}`);
    }
  }

  const serializable = entries.map((entry) => ({
    ...entry
  }));

  const summaryLines = [
    "# Production Generated Markdown Audit Summary",
    "",
    `- Generated at: ${context.generatedAt}`,
    `- Resource group: ${context.resourceGroup}`,
    `- Table prefix: ${context.tablePrefix}`,
    `- Lookback days: ${context.days}`,
    `- Window start: ${context.windowStart}`,
    `- Entries audited: ${summary.totalEntries}`,
    `- Summary markdown entries: ${summary.countsByKind.summary_markdown}`,
    `- Item source markdown entries: ${summary.countsByKind.item_source_markdown}`,
    `- Episode description entries: ${summary.countsByKind.episode_description}`,
    `- Summary episode description entries: ${summary.countsByKind.summary_episode_description}`,
    `- Entries with cleanup issues: ${summary.entriesWithIssues}`,
    `- Stub entries: ${summary.stubEntries}`,
    `- Trivial entries: ${summary.trivialEntries}`,
    `- Empty entries: ${summary.emptyEntries}`,
    `- Fetch-error entries: ${summary.fetchErrorEntries}`,
    "",
    "## Issue Counts",
    ...(Object.entries(summary.issueCounts) as Array<[MarkdownQualityIssueType, number]>).map(([key, value]) => `- ${key}: ${value}`)
  ];

  const flaggedEntries = entries.filter((entry) => entry.issues.length > 0 || entry.classification !== "normal" || entry.fetchError);
  const excerptsLines = [
    "# Production Generated Markdown Audit Excerpts",
    "",
    ...flaggedEntries.flatMap((entry) => [
      `## ${entry.path}`,
      `- kind: ${entry.kind}`,
      `- classification: ${entry.classification}`,
      ...(entry.notes.length > 0 ? [`- notes: ${entry.notes.join(", ")}`] : []),
      ...(entry.fetchError ? [`- fetch_error: ${entry.fetchError}`] : []),
      ...entry.issues.map((issue) => `- ${issue.type}: ${issue.excerpt}`),
      ""
    ])
  ];

  await writeJson(join(reportDir, "results.json"), {
    context,
    summary,
    results: serializable
  });
  await writeText(join(reportDir, "summary.md"), `${summaryLines.join("\n")}\n`);
  await writeText(join(reportDir, "patterns.md"), `# Production Generated Markdown Audit Patterns\n\n${formatIssueSections(grouped).join("\n")}\n`);
  await writeText(join(reportDir, "excerpts.md"), `${excerptsLines.join("\n")}\n`);
}

export async function writeCompareReports(results: ComparisonEntryResult[], summary: CompareSummary, reportDir: string): Promise<void> {
  const rerunIds = results.filter((result) => result.rerunRecommended).map((result) => result.entry.id);
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
    for (const [pathLabel, pathResult] of [
      ["url", result.urlResult],
      ["extension", result.extensionResult]
    ] as const) {
      if (!pathResult?.rawAnalysis) {
        continue;
      }
      for (const issue of pathResult.rawAnalysis.issues) {
        grouped[issue.type].push(`- ${pathLabel} · ${result.entry.id} · ${issue.excerpt}`);
      }
    }
  }

  const summaryLines = [
    "# Extraction Quality Comparison Summary",
    "",
    `- Targets: ${summary.totalTargets}`,
    `- URL passed: ${summary.urlPassed}`,
    `- URL failed: ${summary.urlFailed}`,
    `- Extension passed: ${summary.extensionPassed}`,
    `- Extension failed: ${summary.extensionFailed}`,
    "",
    "## Severity Counts",
    ...(Object.entries(summary.severityCounts) as Array<[keyof CompareSummary["severityCounts"], number]>).map(
      ([key, value]) => `- ${key}: ${value}`
    ),
    "",
    "## Rerun Recommended",
    ...(rerunIds.length > 0 ? rerunIds.map((id) => `- ${id}`) : ["- None"])
  ];

  const serializable = results.map((result) => ({
    entry: result.entry,
    severity: result.severity,
    normalizedMatch: result.normalizedMatch,
    diffSummary: result.diffSummary,
    rerunRecommended: result.rerunRecommended,
    urlResult: result.urlResult
      ? {
          path: result.urlResult.path,
          status: result.urlResult.status,
          title: result.urlResult.title,
          durationMs: result.urlResult.durationMs,
          errorMessage: result.urlResult.errorMessage,
          issueCounts: aggregatePathIssueCounts(result.urlResult),
          cleanedIssueCounts: result.urlResult.cleanedAnalysis?.issueCounts || emptyIssueCounts(),
          screenshotPath: result.urlResult.screenshotPath || null
        }
      : null,
    extensionResult: result.extensionResult
      ? {
          path: result.extensionResult.path,
          status: result.extensionResult.status,
          title: result.extensionResult.title,
          durationMs: result.extensionResult.durationMs,
          errorMessage: result.extensionResult.errorMessage,
          issueCounts: aggregatePathIssueCounts(result.extensionResult),
          cleanedIssueCounts: result.extensionResult.cleanedAnalysis?.issueCounts || emptyIssueCounts(),
          screenshotPath: result.extensionResult.screenshotPath || null,
          captureStats: result.extensionResult.captureStats || null
        }
      : null
  }));

  await writeJson(join(reportDir, "results.json"), {
    summary,
    results: serializable
  });
  await writeText(join(reportDir, "summary.md"), `${summaryLines.join("\n")}\n`);
  await writeText(join(reportDir, "patterns.md"), `# Extraction Quality Patterns\n\n${formatIssueSections(grouped).join("\n")}\n`);
  await writeText(join(reportDir, "rerun-ids.txt"), `${rerunIds.join("\n")}${rerunIds.length > 0 ? "\n" : ""}`);
}
