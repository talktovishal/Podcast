import type { MarkdownQualityAnalysis, MarkdownQualityIssueType } from "../../../packages/core/src/extract/markdownCleanup.ts";

export const commandValues = ["audit", "audit-prod", "compare", "compare-defuddle"] as const;
export type CommandMode = (typeof commandValues)[number];

export const compareModeValues = ["url", "extension", "dual"] as const;
export type CompareMode = (typeof compareModeValues)[number];

export type ArtifactKind = "source" | "summary" | "email";
export type PathKind = "url" | "extension";
export type PathStatus = "passed" | "failed" | "skipped";

export interface CorpusEntry {
  id: string;
  url: string;
  notes: string;
}

export interface CliOptions {
  command: CommandMode;
  mode: CompareMode;
  inputPath?: string;
  siteIds: string[];
  limit?: number;
  days: number;
  resourceGroup?: string;
  tablePrefix?: string;
  concurrencyUrl: number;
  concurrencyExtension: number;
  headed: boolean;
  help: boolean;
}

export interface ArtifactAuditEntry {
  kind: ArtifactKind;
  path: string;
  relativePath: string;
  issueCounts: Record<MarkdownQualityIssueType, number>;
  issues: MarkdownQualityAnalysis["issues"];
  cleanedMarkdown: string;
  hasNarratableText: boolean;
}

export interface CaptureStats {
  rootStrategy?: string;
  conservativeHost?: boolean;
  revealClicks?: number;
  scrollPasses?: number;
  textLength?: number;
  htmlBytes?: number;
  blockedReason?: string;
}

export interface PathExtractionResult {
  path: PathKind;
  status: PathStatus;
  sourceUrl: string;
  title?: string;
  rawMarkdown?: string;
  cleanedMarkdown?: string;
  rawAnalysis?: MarkdownQualityAnalysis;
  cleanedAnalysis?: MarkdownQualityAnalysis;
  durationMs: number;
  errorMessage?: string;
  screenshotPath?: string | null;
  captureStats?: CaptureStats | null;
}

export const comparisonSeverityValues = [
  "exact_match",
  "cosmetic_drift",
  "substantive_divergence",
  "capture_failure",
  "cleanup_issue"
] as const;
export type ComparisonSeverity = (typeof comparisonSeverityValues)[number];

export interface ComparisonDiagnostics {
  severity: ComparisonSeverity;
  normalizedMatch: boolean;
  diffSummary: string;
  rerunRecommended: boolean;
}

export interface ComparisonEntryResult extends ComparisonDiagnostics {
  entry: CorpusEntry;
  urlResult?: PathExtractionResult;
  extensionResult?: PathExtractionResult;
}

export interface AuditSummary {
  totalFiles: number;
  sourceFiles: number;
  digestFiles: number;
  filesWithIssues: number;
  lowSignalFiles: number;
  issueCounts: Record<MarkdownQualityIssueType, number>;
}

export const productionAuditKindValues = [
  "item_source_markdown",
  "summary_markdown",
  "episode_description",
  "summary_episode_description"
] as const;
export type ProductionAuditKind = (typeof productionAuditKindValues)[number];

export const productionEntryClassificationValues = ["normal", "stub", "trivial", "empty"] as const;
export type ProductionEntryClassification = (typeof productionEntryClassificationValues)[number];

export interface ProductionAuditEntry {
  kind: ProductionAuditKind;
  path: string;
  issueCounts: Record<MarkdownQualityIssueType, number>;
  issues: MarkdownQualityAnalysis["issues"];
  cleanedMarkdown: string;
  hasNarratableText: boolean;
  id: string;
  userId: string | null;
  title: string | null;
  storageKey: string | null;
  createdAt: string | null;
  publishedAt: string | null;
  classification: ProductionEntryClassification;
  notes: string[];
  fetchError: string | null;
}

export interface ProductionAuditSummary {
  totalEntries: number;
  countsByKind: Record<ProductionAuditKind, number>;
  entriesWithIssues: number;
  stubEntries: number;
  trivialEntries: number;
  emptyEntries: number;
  fetchErrorEntries: number;
  issueCounts: Record<MarkdownQualityIssueType, number>;
}

export interface CompareSummary {
  totalTargets: number;
  urlPassed: number;
  urlFailed: number;
  extensionPassed: number;
  extensionFailed: number;
  severityCounts: Record<ComparisonSeverity, number>;
}
