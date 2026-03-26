import type { MarkdownQualityIssueType } from "../../../packages/core/src/extract/markdownCleanup.ts";
import type { ComparisonDiagnostics, PathExtractionResult } from "./types.js";
import { normalizeForComparison, summarizeExcerpt } from "./utils.js";

function cleanedIssueTypes(result?: PathExtractionResult): MarkdownQualityIssueType[] {
  if (!result?.cleanedAnalysis) {
    return [];
  }
  return result.cleanedAnalysis.issues.map((issue) => issue.type);
}

function firstParagraphDifference(left: string, right: string): string {
  const leftParagraphs = left.split(/\n{2,}/g).map((value) => value.trim()).filter(Boolean);
  const rightParagraphs = right.split(/\n{2,}/g).map((value) => value.trim()).filter(Boolean);
  const length = Math.max(leftParagraphs.length, rightParagraphs.length);
  for (let index = 0; index < length; index += 1) {
    const a = leftParagraphs[index] || "";
    const b = rightParagraphs[index] || "";
    if (normalizeForComparison(a) !== normalizeForComparison(b)) {
      return `Paragraph ${index + 1} differs. url='${summarizeExcerpt(a)}' extension='${summarizeExcerpt(b)}'`;
    }
  }
  return "The cleaned markdown differs after normalization, but no single paragraph stood out.";
}

export function classifyComparison(urlResult?: PathExtractionResult, extensionResult?: PathExtractionResult): ComparisonDiagnostics {
  const availableResults = [urlResult, extensionResult].filter(Boolean) as PathExtractionResult[];
  if (availableResults.length === 1) {
    const [single] = availableResults;
    if (single.status === "failed") {
      return {
        severity: "capture_failure",
        normalizedMatch: false,
        diffSummary: `${single.path} extraction failed before comparison.`,
        rerunRecommended: true
      };
    }

    const postCleanupIssues = cleanedIssueTypes(single);
    if (postCleanupIssues.length > 0) {
      return {
        severity: "cleanup_issue",
        normalizedMatch: false,
        diffSummary: `Single-path run completed but cleanup issues remain: ${Array.from(new Set(postCleanupIssues)).join(", ")}.`,
        rerunRecommended: true
      };
    }

    return {
      severity: "exact_match",
      normalizedMatch: true,
      diffSummary: `Single-path ${single.path} run completed successfully.`,
      rerunRecommended: false
    };
  }

  if ((urlResult && urlResult.status === "failed") || (extensionResult && extensionResult.status === "failed")) {
    return {
      severity: "capture_failure",
      normalizedMatch: false,
      diffSummary: "One or both extraction paths failed before comparison.",
      rerunRecommended: true
    };
  }

  const postCleanupIssues = [...cleanedIssueTypes(urlResult), ...cleanedIssueTypes(extensionResult)];
  if (postCleanupIssues.length > 0) {
    return {
      severity: "cleanup_issue",
      normalizedMatch: false,
      diffSummary: `Post-cleanup issues remain: ${Array.from(new Set(postCleanupIssues)).join(", ")}.`,
      rerunRecommended: true
    };
  }

  const left = urlResult?.cleanedMarkdown || "";
  const right = extensionResult?.cleanedMarkdown || "";
  const normalizedMatch = normalizeForComparison(left) === normalizeForComparison(right);
  if (left === right) {
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
    diffSummary: firstParagraphDifference(left, right),
    rerunRecommended: true
  };
}
