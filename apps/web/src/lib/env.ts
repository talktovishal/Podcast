import { resolve } from "node:path";
import { BRAND_NAME, BRAND_SLUG, DEFAULT_ADMIN_EMAIL, DEFAULT_DEMO_EMAIL } from "@articlepod/core";

const repoRoot = resolve(process.cwd(), "../..");
const defaultLogRoot = resolve(repoRoot, ".runtime/logs");

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

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

export const env = {
  brandName: process.env.BRAND_NAME ?? BRAND_NAME,
  runtimeProfile: process.env.RUNTIME_PROFILE ?? "simple",
  databaseUrl: normalizeDatabaseUrl(process.env.DATABASE_URL ?? `file:${resolve(process.cwd(), ".data/db.sqlite")}`),
  storageBackend,
  storageRoot: process.env.STORAGE_ROOT ?? resolve(process.cwd(), ".data/media"),
  storageContainer: process.env.AZURE_STORAGE_CONTAINER ?? BRAND_SLUG,
  azureStorageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
  azureStorageAccountUrl: process.env.AZURE_STORAGE_ACCOUNT_URL,
  azureStorageSasToken: process.env.AZURE_STORAGE_SAS_TOKEN,
  azureStorageCreateContainer: (process.env.AZURE_STORAGE_CREATE_CONTAINER ?? "1") !== "0",
  mediaRoot: process.env.MEDIA_ROOT ?? resolve(process.cwd(), ".data/media"),
  uploadRoot: process.env.UPLOAD_ROOT ?? resolve(process.cwd(), ".data/uploads"),
  logRoot: process.env.LOG_ROOT ?? defaultLogRoot,
  logRetentionDays: Number(process.env.LOG_RETENTION_DAYS ?? 14),
  logMaxBytes: Number(process.env.LOG_MAX_BYTES ?? 1 * 1024 * 1024),
  logMaxFiles: Number(process.env.LOG_MAX_FILES ?? 10),
  podcastRequestLoggingEnabled: (process.env.PODCAST_REQUEST_LOGGING ?? "1") !== "0",
  telemetryEnabled: process.env.OTEL_ENABLED === "1",
  telemetryServiceName: process.env.OTEL_SERVICE_NAME ?? "web",
  azureMonitorConnectionString: process.env.AZURE_MONITOR_CONNECTION_STRING,
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
  freeTrialSubmissionLimit: parseNonNegativeInt(process.env.FREE_TRIAL_SUBMISSION_LIMIT, 2),
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  appleClientId: process.env.APPLE_CLIENT_ID,
  appleClientSecret: process.env.APPLE_CLIENT_SECRET,
  openAiApiKey: process.env.OPENAI_API_KEY,
  digestSchedulerSecret: process.env.DIGEST_SCHEDULER_SECRET ?? "",
  pythonTtsUrl: process.env.PYTHON_TTS_URL ?? "http://127.0.0.1:8010",
  pythonTtsTimeoutMs: Number(process.env.PYTHON_TTS_TIMEOUT_MS ?? 120000),
  demoEmail: process.env.DEMO_EMAIL ?? DEFAULT_DEMO_EMAIL,
  demoPassword: process.env.DEMO_PASSWORD,
  adminEmail: process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD
};
