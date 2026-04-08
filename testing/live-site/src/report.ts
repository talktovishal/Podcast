import { join } from "node:path";
import type {
  ActualOutcome,
  EntryRunResult,
  ExpectedOutcome,
  FailureClassification,
  PathRunResult,
  ProdProbeResult,
  RunReport,
  SuiteSummary
} from "./types.js";
import { writeText } from "./utils.js";

function isBlocked(actual: ActualOutcome): boolean {
  return actual === "blocked_with_extension_hint" || actual === "blocked_without_extension_hint";
}

export function matchLocalExpectation(expected: ExpectedOutcome, actual: ActualOutcome): boolean {
  if (expected === "manual_review") {
    return actual !== "harness_issue";
  }
  return expected === actual;
}

export function matchProdProbeExpectation(expected: ExpectedOutcome, actual: ActualOutcome): boolean {
  if (expected === "manual_review") {
    return actual !== "harness_issue";
  }
  if (expected === "ready") {
    return actual === "ready";
  }
  return isBlocked(actual);
}

export function classifyPathFailure(result: PathRunResult): FailureClassification {
  if (result.actual === "harness_issue") {
    return "harness_issue";
  }
  if (result.podcastContract?.ran && !result.podcastContract.passed) {
    return "product_regression";
  }
  if (result.expected === "blocked_with_extension_hint" && result.actual === "blocked_without_extension_hint") {
    const normalizedError = (result.errorMessage || "").toLowerCase();
    if (
      result.errorCode === "EXTRACTION_EMPTY" ||
      normalizedError.includes("404") ||
      normalizedError.includes("not found") ||
      normalizedError.includes("could not extract readable content")
    ) {
      return "site_behavior_changed";
    }
    return "product_regression";
  }
  if (result.expected === "blocked_without_extension_hint" && result.actual === "blocked_with_extension_hint") {
    return "site_behavior_changed";
  }
  if (result.expected === "ready" && result.actual !== "ready") {
    return "site_behavior_changed";
  }
  if (result.expected !== "ready" && result.actual === "ready") {
    return "site_behavior_changed";
  }
  if (result.expected === "manual_review") {
    return "site_behavior_changed";
  }
  return "expected_site_block";
}

export function classifyProdProbeFailure(result: ProdProbeResult): FailureClassification {
  if (result.actual === "harness_issue") {
    return "harness_issue";
  }
  if (result.expected === "ready" && result.actual !== "ready") {
    return "site_behavior_changed";
  }
  if (result.expected !== "ready" && result.actual === "ready") {
    return "site_behavior_changed";
  }
  return "expected_site_block";
}

export function buildSummary(results: EntryRunResult[]): SuiteSummary {
  const summary: SuiteSummary = {
    totalTargets: results.length,
    urlPassed: 0,
    urlFailed: 0,
    extensionPassed: 0,
    extensionFailed: 0,
    prodProbePassed: 0,
    prodProbeFailed: 0
  };

  for (const result of results) {
    if (result.urlResult) {
      if (result.urlResult.status === "passed") {
        summary.urlPassed += 1;
      } else if (result.urlResult.status === "failed") {
        summary.urlFailed += 1;
      }
    }
    if (result.extensionResult) {
      if (result.extensionResult.status === "passed") {
        summary.extensionPassed += 1;
      } else if (result.extensionResult.status === "failed") {
        summary.extensionFailed += 1;
      }
    }
    if (result.prodProbeResult) {
      if (result.prodProbeResult.status === "passed") {
        summary.prodProbePassed += 1;
      } else if (result.prodProbeResult.status === "failed") {
        summary.prodProbeFailed += 1;
      }
    }
  }

  return summary;
}

function recommendationFromClassification(classification: FailureClassification, pathLabel: string): string {
  switch (classification) {
    case "product_regression":
      return `Investigate the ${pathLabel} behavior in repo code and rerun the impacted subset after fixing it.`;
    case "site_behavior_changed":
      return "Review the site behavior and update corpus.md or quirks.md if the product is still behaving correctly.";
    case "expected_site_block":
      return "This is an expected block. Keep it documented and monitor for drift over time.";
    case "harness_issue":
      return "Fix the harness itself before trusting this result.";
  }
}

function formatResultLine(label: string, site: string, expected: string, actual: string, recommendation: string, error?: string | null): string {
  const suffix = error ? ` — ${error}` : "";
  return `- ${label} · ${site} · expected \`${expected}\` · actual \`${actual}\`${suffix}\n  Recommendation: ${recommendation}`;
}

export async function writeMarkdownReports(report: RunReport, reportDir: string): Promise<void> {
  const failureBuckets: Record<FailureClassification, string[]> = {
    product_regression: [],
    expected_site_block: [],
    site_behavior_changed: [],
    harness_issue: []
  };

  for (const result of report.results) {
    const site = `${result.entry.id} (${result.entry.site})`;
    if (result.urlResult?.status === "failed" && result.urlResult.classification) {
      failureBuckets[result.urlResult.classification].push(
        formatResultLine(
          "url",
          site,
          result.urlResult.expected,
          result.urlResult.actual,
          result.urlResult.recommendation || recommendationFromClassification(result.urlResult.classification, "URL"),
          result.urlResult.errorMessage
        )
      );
    }
    if (result.extensionResult?.status === "failed" && result.extensionResult.classification) {
      failureBuckets[result.extensionResult.classification].push(
        formatResultLine(
          "extension",
          site,
          result.extensionResult.expected,
          result.extensionResult.actual,
          result.extensionResult.recommendation || recommendationFromClassification(result.extensionResult.classification, "extension"),
          result.extensionResult.errorMessage
        )
      );
    }
    if (result.prodProbeResult?.status === "failed" && result.prodProbeResult.classification) {
      failureBuckets[result.prodProbeResult.classification].push(
        formatResultLine(
          "prod-probe",
          site,
          result.prodProbeResult.expected,
          result.prodProbeResult.actual,
          result.prodProbeResult.recommendation || recommendationFromClassification(result.prodProbeResult.classification, "prod-probe"),
          result.prodProbeResult.errorMessage
        )
      );
    }
  }

  const summaryLines = [
    "# Live Site Validation Summary",
    "",
    `- Targets: ${report.summary.totalTargets}`,
    `- URL passed: ${report.summary.urlPassed}`,
    `- URL failed: ${report.summary.urlFailed}`,
    `- Extension passed: ${report.summary.extensionPassed}`,
    `- Extension failed: ${report.summary.extensionFailed}`,
    `- Prod probe passed: ${report.summary.prodProbePassed}`,
    `- Prod probe failed: ${report.summary.prodProbeFailed}`,
    "",
    "## Provenance",
    "",
    `- Started: ${report.provenance.startedAt}`,
    `- Git commit: ${report.provenance.gitCommit}`,
    `- Git branch: ${report.provenance.gitBranch}`,
    `- App URL: ${report.provenance.appUrl}`,
    `- Extension version: ${report.provenance.extensionVersion}`,
    `- Mode: ${report.provenance.runnerMode}`,
    `- Env: ${report.provenance.envMode}`,
    "",
    "## Smoke",
    "",
    report.smoke
      ? `- Status: ${report.smoke.status}${report.smoke.errorMessage ? ` (${report.smoke.errorMessage})` : ""}`
      : "- Status: skipped"
  ];

  const failureSections = [
    "# Live Site Failures",
    "",
    "## Product Regression",
    ...(failureBuckets.product_regression.length > 0 ? failureBuckets.product_regression : ["- None"]),
    "",
    "## Expected Site Block",
    ...(failureBuckets.expected_site_block.length > 0 ? failureBuckets.expected_site_block : ["- None"]),
    "",
    "## Site Behavior Changed",
    ...(failureBuckets.site_behavior_changed.length > 0 ? failureBuckets.site_behavior_changed : ["- None"]),
    "",
    "## Harness Issue",
    ...(failureBuckets.harness_issue.length > 0 ? failureBuckets.harness_issue : ["- None"])
  ];

  await writeText(join(reportDir, "summary.md"), `${summaryLines.join("\n")}\n`);
  await writeText(join(reportDir, "failures.md"), `${failureSections.join("\n")}\n`);
}
