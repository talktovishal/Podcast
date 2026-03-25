export const cohortValues = ["news", "social"] as const;
export type Cohort = (typeof cohortValues)[number];

export const pathModeValues = ["url_only", "extension_only", "both", "extension_primary"] as const;
export type PathMode = (typeof pathModeValues)[number];

export const expectedOutcomeValues = [
  "ready",
  "blocked_with_extension_hint",
  "blocked_without_extension_hint",
  "manual_review"
] as const;
export type ExpectedOutcome = (typeof expectedOutcomeValues)[number];

export const actualOutcomeValues = [...expectedOutcomeValues, "harness_issue"] as const;
export type ActualOutcome = (typeof actualOutcomeValues)[number];

export const runnerModeValues = ["url", "extension", "dual"] as const;
export type RunnerMode = (typeof runnerModeValues)[number];

export const runnerEnvValues = ["local", "prod-probe", "dual"] as const;
export type RunnerEnv = (typeof runnerEnvValues)[number];

export type FailureClassification = "product_regression" | "expected_site_block" | "site_behavior_changed" | "harness_issue";

export interface CorpusEntry {
  id: string;
  cohort: Cohort;
  site: string;
  url: string;
  pathMode: PathMode;
  expectedUrl: ExpectedOutcome;
  expectedExtension: ExpectedOutcome;
  requiresManual: boolean;
  notes: string;
}

export interface CliOptions {
  mode: RunnerMode;
  env: RunnerEnv;
  siteIds: string[];
  cohort?: Cohort;
  limit?: number;
  keepStack: boolean;
  help: boolean;
}

export interface LocalHarnessConfig {
  appUrl: string;
  demoEmail: string;
  demoPassword: string;
  startedParity: boolean;
  feedUrl: string;
  cookieHeader: string;
}

export interface Provenance {
  appUrl: string;
  envMode: RunnerEnv;
  runnerMode: RunnerMode;
  gitCommit: string;
  gitBranch: string;
  extensionVersion: string;
  startedAt: string;
}

export interface PodcastContractResult {
  ran: boolean;
  passed: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
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

export interface PathRunResult {
  path: "url" | "extension";
  expected: ExpectedOutcome;
  actual: ActualOutcome;
  matchedExpectation: boolean;
  status: "passed" | "failed" | "skipped";
  itemId?: string;
  sourceUrl: string;
  title: string;
  durationMs: number;
  timeToReadyMs?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  extensionHintPresent?: boolean;
  requiresManual: boolean;
  captureStats?: CaptureStats | null;
  screenshotPath?: string | null;
  podcastContract?: PodcastContractResult;
  classification?: FailureClassification;
  recommendation?: string;
}

export interface ProdProbeResult {
  expected: ExpectedOutcome;
  actual: ActualOutcome;
  matchedExpectation: boolean;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  runId?: number;
  workflowUrl?: string;
  artifactDir?: string;
  probeJsonPath?: string;
  probeJson?: Record<string, unknown> | null;
  errorMessage?: string | null;
  classification?: FailureClassification;
  recommendation?: string;
}

export interface ExtensionSmokeResult {
  status: "passed" | "failed" | "skipped";
  targetId?: string;
  targetUrl?: string;
  durationMs: number;
  extensionId?: string;
  errorMessage?: string | null;
  screenshotPath?: string | null;
  recommendation?: string;
}

export interface EntryRunResult {
  entry: CorpusEntry;
  urlResult?: PathRunResult;
  extensionResult?: PathRunResult;
  prodProbeResult?: ProdProbeResult;
}

export interface SuiteSummary {
  totalTargets: number;
  urlPassed: number;
  urlFailed: number;
  extensionPassed: number;
  extensionFailed: number;
  prodProbePassed: number;
  prodProbeFailed: number;
}

export interface RunReport {
  provenance: Provenance;
  options: CliOptions;
  summary: SuiteSummary;
  smoke: ExtensionSmokeResult | null;
  results: EntryRunResult[];
}
