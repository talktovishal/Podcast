import { config } from "dotenv";
import { resolve } from "node:path";
import { BRAND_SLUG, DEFAULT_DEMO_EMAIL } from "@articlepod/core";

config({ path: resolve(process.cwd(), ".env") });
const repoRoot = resolve(process.cwd(), "../..");
const defaultLogRoot = resolve(repoRoot, ".runtime/logs");
type WorkerRole = "primary" | "overflow";

function normalizeDatabaseUrl(raw: string): string {
  if (!raw.startsWith("file:")) {
    return raw;
  }

  const filePart = raw.slice("file:".length);
  if (filePart.startsWith("/") || /^[A-Za-z]:[\\/]/.test(filePart)) {
    return `file:${filePart}`;
  }

  const baseDir = filePart.startsWith("./apps/") || filePart.startsWith("apps/") ? repoRoot : process.cwd();
  return `file:${resolve(baseDir, filePart)}`;
}

const storageBackend = process.env.STORAGE_BACKEND === "azure_blob" ? "azure_blob" : "local";

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function toNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function parseWorkerRole(value: string | undefined): WorkerRole {
  if (value === "overflow") {
    return "overflow";
  }
  return "primary";
}

const pythonTtsTimeoutMs = toPositiveInt(process.env.PYTHON_TTS_TIMEOUT_MS, 120000);

export const workerEnv = {
  runtimeProfile: process.env.RUNTIME_PROFILE ?? "simple",
  workerRole: parseWorkerRole(process.env.WORKER_ROLE),
  overflowEnabled: (process.env.WORKER_OVERFLOW_ENABLED ?? "0") === "1",
  overflowPolicyEvalMs: toPositiveInt(process.env.WORKER_OVERFLOW_POLICY_EVAL_MS, 15_000),
  overflowActivateQueueDepth: toNonNegativeInt(process.env.WORKER_OVERFLOW_ACTIVATE_QUEUE_DEPTH, 8),
  overflowDeactivateQueueDepth: toNonNegativeInt(process.env.WORKER_OVERFLOW_DEACTIVATE_QUEUE_DEPTH, 2),
  overflowActivateOldestMs: toNonNegativeInt(process.env.WORKER_OVERFLOW_ACTIVATE_OLDEST_MS, 5 * 60 * 1000),
  overflowDeactivateOldestMs: toNonNegativeInt(process.env.WORKER_OVERFLOW_DEACTIVATE_OLDEST_MS, 2 * 60 * 1000),
  overflowMinActiveMs: toNonNegativeInt(process.env.WORKER_OVERFLOW_MIN_ACTIVE_MS, 3 * 60 * 1000),
  overflowPythonTtsUrl: process.env.OVERFLOW_PYTHON_TTS_URL,
  overflowPythonTtsTimeoutMs: toPositiveInt(process.env.OVERFLOW_PYTHON_TTS_TIMEOUT_MS, pythonTtsTimeoutMs),
  overflowPythonTtsSecret: process.env.OVERFLOW_PYTHON_TTS_SECRET,
  databaseUrl: normalizeDatabaseUrl(process.env.DATABASE_URL ?? `file:${resolve(process.cwd(), "../web/.data/db.sqlite")}`),
  storageBackend,
  storageRoot: process.env.STORAGE_ROOT ?? resolve(process.cwd(), "../web/.data/media"),
  storageContainer: process.env.AZURE_STORAGE_CONTAINER ?? BRAND_SLUG,
  azureStorageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
  azureStorageAccountUrl: process.env.AZURE_STORAGE_ACCOUNT_URL,
  azureStorageSasToken: process.env.AZURE_STORAGE_SAS_TOKEN,
  azureStorageCreateContainer: (process.env.AZURE_STORAGE_CREATE_CONTAINER ?? "1") !== "0",
  mediaRoot: process.env.MEDIA_ROOT ?? resolve(process.cwd(), "../web/.data/media"),
  logRoot: process.env.LOG_ROOT ?? defaultLogRoot,
  logRetentionDays: Number(process.env.LOG_RETENTION_DAYS ?? 14),
  logMaxBytes: Number(process.env.LOG_MAX_BYTES ?? 1 * 1024 * 1024),
  logMaxFiles: Number(process.env.LOG_MAX_FILES ?? 10),
  telemetryEnabled: process.env.OTEL_ENABLED === "1",
  telemetryServiceName: process.env.OTEL_SERVICE_NAME ?? "worker",
  azureMonitorConnectionString: process.env.AZURE_MONITOR_CONNECTION_STRING,
  pollMs: Number(process.env.WORKER_POLL_MS ?? 2500),
  staleProcessingMs: Number(process.env.WORKER_STALE_PROCESSING_MS ?? 3 * 60 * 1000),
  retryPollMs: Number(process.env.WORKER_RETRY_POLL_MS ?? 5000),
  maxRetryAttempts: Number(process.env.WORKER_MAX_RETRY_ATTEMPTS ?? 5),
  rawArtifactRetentionDays: Number(process.env.WORKER_RAW_ARTIFACT_RETENTION_DAYS ?? 90),
  ttsChunkMaxChars: Number(process.env.WORKER_TTS_CHUNK_MAX_CHARS ?? 1800),
  digestInternalSchedulerEnabled: (process.env.DIGEST_INTERNAL_SCHEDULER_ENABLED ?? "1") !== "0",
  digestSchedulerTickMs: Number(process.env.DIGEST_SCHEDULER_TICK_MS ?? 60_000),
  digestSchedulerSecret: process.env.DIGEST_SCHEDULER_SECRET ?? "",
  digestRunMaxRetryAttempts: Number(process.env.DIGEST_RUN_MAX_RETRY_ATTEMPTS ?? 3),
  digestSummaryProvider: process.env.DIGEST_SUMMARY_PROVIDER ?? "stub",
  digestSummaryProxyUrl: process.env.DIGEST_SUMMARY_PROXY_URL,
  digestSummaryTimeoutMs: Number(process.env.DIGEST_SUMMARY_TIMEOUT_MS ?? 30_000),
  digestEmailProvider: process.env.DIGEST_EMAIL_PROVIDER ?? "stub",
  openAiApiKey: process.env.OPENAI_API_KEY,
  pythonTtsUrl: process.env.PYTHON_TTS_URL ?? "http://127.0.0.1:8010",
  pythonTtsTimeoutMs,
  pythonTtsSecret: process.env.PYTHON_TTS_SECRET,
  demoEmail: process.env.DEMO_EMAIL ?? DEFAULT_DEMO_EMAIL
};

if (workerEnv.runtimeProfile !== "simple" && !workerEnv.digestSchedulerSecret) {
  throw new Error("DIGEST_SCHEDULER_SECRET must be set when RUNTIME_PROFILE is not 'simple'");
}
