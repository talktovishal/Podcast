import { resolve } from "node:path";
import { BRAND_NAME, BRAND_SLUG, DEFAULT_ADMIN_EMAIL, DEFAULT_DEMO_EMAIL } from "@articlepod/core";

const repoRoot = resolve(process.cwd(), "../..");
const defaultLogRoot = resolve(repoRoot, ".runtime/logs");
type MetadataMirrorBackend = "none" | "azure_table";
type MetadataPrimaryBackend = "prisma" | "azure_table";
type AnalyticsStorageMode = "full" | "off";
type JobEventStorageMode = "database" | "off";
type ItemDispatchBackend = "prisma" | "azure_queue";

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseBoolean(raw: string | undefined, fallback = false): boolean {
  if (raw === undefined) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return fallback;
}

function parseCsv(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

const defaultBillingSandboxAllowlistEmails = [
  "talktovishal@gmail.com",
  "smitabusar@gmail.com",
  "smitavishalbusiness@gmail.com",
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_DEMO_EMAIL
].map((value) => value.toLowerCase());

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

function normalizeLocalPath(raw: string): string {
  if (raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw)) {
    return raw;
  }

  const baseDir = raw.startsWith("./apps/") || raw.startsWith("apps/") ? repoRoot : process.cwd();
  return resolve(baseDir, raw);
}

function parseMetadataMirrorBackend(raw: string | undefined): MetadataMirrorBackend {
  if (raw === "azure_table") {
    return "azure_table";
  }
  return "none";
}

function parseMetadataPrimaryBackend(raw: string | undefined): MetadataPrimaryBackend {
  if (raw === "azure_table") {
    return "azure_table";
  }
  return "prisma";
}

function parseAnalyticsStorageMode(raw: string | undefined): AnalyticsStorageMode {
  if (raw === "off") {
    return "off";
  }
  return "full";
}

function parseJobEventStorageMode(raw: string | undefined): JobEventStorageMode {
  if (raw === "off") {
    return "off";
  }
  return "database";
}

function parseItemDispatchBackend(raw: string | undefined): ItemDispatchBackend | "auto" {
  if (raw === "prisma" || raw === "azure_queue") {
    return raw;
  }
  return "auto";
}

const storageBackend = process.env.STORAGE_BACKEND === "azure_blob" ? "azure_blob" : "local";
const logRetentionDays = parseNonNegativeInt(process.env.LOG_RETENTION_DAYS, 14);
const logErrorRetentionDays = parseNonNegativeInt(process.env.LOG_ERROR_RETENTION_DAYS, Math.max(logRetentionDays, 30));
const itemDispatchBackendSetting = parseItemDispatchBackend(process.env.ITEM_DISPATCH_BACKEND);
const itemDispatchBackend: ItemDispatchBackend =
  itemDispatchBackendSetting === "auto"
    ? storageBackend === "azure_blob" && (process.env.AZURE_STORAGE_CONNECTION_STRING || (process.env.AZURE_STORAGE_ACCOUNT_URL && process.env.AZURE_STORAGE_SAS_TOKEN))
      ? "azure_queue"
      : "prisma"
    : itemDispatchBackendSetting;

export const env = {
  brandName: process.env.BRAND_NAME ?? BRAND_NAME,
  runtimeProfile: process.env.RUNTIME_PROFILE ?? "simple",
  analyticsStorageMode: parseAnalyticsStorageMode(process.env.ANALYTICS_STORAGE_MODE),
  jobEventStorageMode: parseJobEventStorageMode(process.env.JOB_EVENT_STORAGE_MODE),
  demoExtractionTraceEnabled: parseBoolean(process.env.DEMO_EXTRACTION_TRACE_ENABLED, true),
  metadataPrimaryBackend: parseMetadataPrimaryBackend(process.env.METADATA_PRIMARY_BACKEND),
  metadataMirrorBackend: parseMetadataMirrorBackend(process.env.METADATA_MIRROR_BACKEND),
  metadataMirrorDualWrite: parseBoolean(process.env.METADATA_MIRROR_DUAL_WRITE, false),
  metadataCanaryCompare: parseBoolean(process.env.METADATA_CANARY_COMPARE, false),
  azureTableConnectionString: process.env.AZURE_TABLE_CONNECTION_STRING,
  azureTableAccountUrl: process.env.AZURE_TABLE_ACCOUNT_URL,
  azureTableSasToken: process.env.AZURE_TABLE_SAS_TOKEN,
  azureTablePrefix: process.env.AZURE_TABLE_PREFIX ?? BRAND_SLUG,
  azureTableCreateTables: parseBoolean(process.env.AZURE_TABLE_CREATE_TABLES, true),
  databaseUrl: normalizeDatabaseUrl(process.env.DATABASE_URL ?? `file:${resolve(process.cwd(), ".data/db.sqlite")}`),
  storageBackend,
  storageRoot: normalizeLocalPath(process.env.STORAGE_ROOT ?? resolve(process.cwd(), ".data/media")),
  storageContainer: process.env.AZURE_STORAGE_CONTAINER ?? BRAND_SLUG,
  azureStorageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
  azureStorageAccountUrl: process.env.AZURE_STORAGE_ACCOUNT_URL,
  azureStorageSasToken: process.env.AZURE_STORAGE_SAS_TOKEN,
  azureStorageCreateContainer: (process.env.AZURE_STORAGE_CREATE_CONTAINER ?? "1") !== "0",
  itemDispatchBackend,
  itemDispatchQueueName: process.env.ITEM_DISPATCH_QUEUE_NAME ?? `${BRAND_SLUG}-item-dispatch`,
  itemDispatchCreateQueue: parseBoolean(process.env.ITEM_DISPATCH_CREATE_QUEUE, true),
  mediaRoot: normalizeLocalPath(process.env.MEDIA_ROOT ?? resolve(process.cwd(), ".data/media")),
  uploadRoot: normalizeLocalPath(process.env.UPLOAD_ROOT ?? resolve(process.cwd(), ".data/uploads")),
  logRoot: normalizeLocalPath(process.env.LOG_ROOT ?? defaultLogRoot),
  logRetentionDays,
  logErrorRetentionDays,
  logMaxBytes: Number(process.env.LOG_MAX_BYTES ?? 1 * 1024 * 1024),
  logMaxFiles: Number(process.env.LOG_MAX_FILES ?? 10),
  audioRetentionDays: parsePositiveInt(process.env.AUDIO_RETENTION_DAYS ?? process.env.WORKER_AUDIO_RETENTION_DAYS, 60),
  podcastRequestLoggingEnabled: (process.env.PODCAST_REQUEST_LOGGING ?? "1") !== "0",
  telemetryEnabled: process.env.OTEL_ENABLED === "1",
  telemetryServiceName: process.env.OTEL_SERVICE_NAME ?? "web",
  azureMonitorConnectionString: process.env.AZURE_MONITOR_CONNECTION_STRING,
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
  freeTrialSubmissionLimit: parseNonNegativeInt(process.env.FREE_TRIAL_SUBMISSION_LIMIT, 2),
  proDailyPodcastLimit: parseNonNegativeInt(process.env.PRO_DAILY_PODCAST_LIMIT, 15),
  proWeeklySummaryLimit: parseNonNegativeInt(process.env.PRO_WEEKLY_SUMMARY_LIMIT, 5),
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  facebookAppId: process.env.FACEBOOK_APP_ID,
  facebookAppSecret: process.env.FACEBOOK_APP_SECRET,
  appleClientId: process.env.APPLE_CLIENT_ID,
  appleClientSecret: process.env.APPLE_CLIENT_SECRET,
  geoHeaderCountry: process.env.GEO_HEADER_COUNTRY,
  geoHeaderRegion: process.env.GEO_HEADER_REGION,
  geoHeaderCity: process.env.GEO_HEADER_CITY,
  feedbackMirrorEnabled: parseBoolean(process.env.GITHUB_FEEDBACK_MIRROR_ENABLED, false),
  feedbackMirrorOwner: process.env.GITHUB_FEEDBACK_OWNER?.trim(),
  feedbackMirrorRepo: process.env.GITHUB_FEEDBACK_REPO?.trim(),
  feedbackMirrorToken: process.env.GITHUB_FEEDBACK_TOKEN?.trim(),
  feedbackMirrorLabels: parseCsv(process.env.GITHUB_FEEDBACK_LABELS),
  billingSandboxAllowlistEmails: Array.from(
    new Set([...defaultBillingSandboxAllowlistEmails, ...parseCsv(process.env.BILLING_SANDBOX_ALLOWLIST_EMAILS).map((value) => value.toLowerCase())])
  ),
  stripeLiveSecretKey: process.env.STRIPE_LIVE_SECRET_KEY?.trim() ?? process.env.STRIPE_SECRET_KEY?.trim(),
  stripeLiveWebhookSecret: process.env.STRIPE_LIVE_WEBHOOK_SECRET?.trim() ?? process.env.STRIPE_WEBHOOK_SECRET?.trim(),
  stripeLivePriceProMonthly: process.env.STRIPE_LIVE_PRICE_PRO_MONTHLY?.trim() ?? process.env.STRIPE_PRICE_PRO_MONTHLY?.trim(),
  stripeLivePriceProAnnual: process.env.STRIPE_LIVE_PRICE_PRO_ANNUAL?.trim() ?? process.env.STRIPE_PRICE_PRO_ANNUAL?.trim(),
  stripeLiveBillingPortalConfigurationId:
    process.env.STRIPE_LIVE_BILLING_PORTAL_CONFIGURATION_ID?.trim() ??
    process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID?.trim(),
  stripeSandboxSecretKey: process.env.STRIPE_SANDBOX_SECRET_KEY?.trim(),
  stripeSandboxWebhookSecret: process.env.STRIPE_SANDBOX_WEBHOOK_SECRET?.trim(),
  stripeSandboxPriceProMonthly: process.env.STRIPE_SANDBOX_PRICE_PRO_MONTHLY?.trim(),
  stripeSandboxPriceProAnnual: process.env.STRIPE_SANDBOX_PRICE_PRO_ANNUAL?.trim(),
  stripeSandboxBillingPortalConfigurationId: process.env.STRIPE_SANDBOX_BILLING_PORTAL_CONFIGURATION_ID?.trim(),
  stripeSecretKey: process.env.STRIPE_LIVE_SECRET_KEY?.trim() ?? process.env.STRIPE_SECRET_KEY?.trim(),
  stripeWebhookSecret: process.env.STRIPE_LIVE_WEBHOOK_SECRET?.trim() ?? process.env.STRIPE_WEBHOOK_SECRET?.trim(),
  stripePriceProMonthly: process.env.STRIPE_LIVE_PRICE_PRO_MONTHLY?.trim() ?? process.env.STRIPE_PRICE_PRO_MONTHLY?.trim(),
  stripePriceProAnnual: process.env.STRIPE_LIVE_PRICE_PRO_ANNUAL?.trim() ?? process.env.STRIPE_PRICE_PRO_ANNUAL?.trim(),
  stripeBillingPortalConfigurationId:
    process.env.STRIPE_LIVE_BILLING_PORTAL_CONFIGURATION_ID?.trim() ??
    process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID?.trim(),
  openAiApiKey: process.env.OPENAI_API_KEY,
  digestSchedulerSecret: process.env.DIGEST_SCHEDULER_SECRET ?? "",
  mediaSigningKey: process.env.MEDIA_SIGNING_KEY ?? "",
  pythonTtsUrl: process.env.PYTHON_TTS_URL ?? "http://127.0.0.1:8010",
  pythonTtsTimeoutMs: Number(process.env.PYTHON_TTS_TIMEOUT_MS ?? 120000),
  demoEmail: process.env.DEMO_EMAIL ?? DEFAULT_DEMO_EMAIL,
  demoPassword: process.env.DEMO_PASSWORD,
  adminEmail: process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD
};

if (env.runtimeProfile !== "simple" && !env.digestSchedulerSecret) {
  throw new Error("DIGEST_SCHEDULER_SECRET must be set when RUNTIME_PROFILE is not 'simple'");
}

if (env.runtimeProfile !== "simple" && !env.mediaSigningKey) {
  throw new Error("MEDIA_SIGNING_KEY must be set when RUNTIME_PROFILE is not 'simple'");
}
