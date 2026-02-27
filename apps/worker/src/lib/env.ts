import { config } from "dotenv";
import { resolve } from "node:path";
import { BRAND_SLUG, DEFAULT_DEMO_EMAIL } from "@articlepod/core";

config({ path: resolve(process.cwd(), ".env") });
const repoRoot = resolve(process.cwd(), "../..");
const defaultLogRoot = resolve(repoRoot, ".runtime/logs");

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

export const workerEnv = {
  runtimeProfile: process.env.RUNTIME_PROFILE ?? "simple",
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
  pythonTtsTimeoutMs: Number(process.env.PYTHON_TTS_TIMEOUT_MS ?? 120000),
  demoEmail: process.env.DEMO_EMAIL ?? DEFAULT_DEMO_EMAIL
};
