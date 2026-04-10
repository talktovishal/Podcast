import fs from "node:fs";
import path from "node:path";

function parseArgs() {
  const args = process.argv.slice(2);
  let profile = process.env.RUNTIME_PROFILE || "simple";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--profile") {
      profile = args[index + 1] || profile;
      index += 1;
    }
  }

  if (!["simple", "parity", "azure"].includes(profile)) {
    throw new Error(`Unsupported profile '${profile}'. Expected one of: simple, parity, azure.`);
  }

  return { profile };
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const result = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const idx = trimmed.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    const raw = trimmed.slice(idx + 1).trim();
    result[key] = raw.replace(/^"(.*)"$/, "$1");
  }
  return result;
}

function getEffectiveEnv(profile) {
  const rootEnvPath = path.resolve(".env");
  const profileEnvPath = path.resolve(`.env.${profile}`);
  const profileExamplePath = path.resolve(`.env.${profile}.example`);

  // Keep env validation aligned with run.sh + scripts/dev.mjs: local repo
  // commands use the repo-root env files, so stale app-local env files
  // should not override or mask the active configuration.
  const merged = {
    ...parseEnvFile(profileExamplePath),
    ...parseEnvFile(rootEnvPath),
    ...parseEnvFile(profileEnvPath),
    ...process.env
  };

  return merged;
}

function profileRequirements(profile) {
  const commonOptional = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "APPLE_CLIENT_ID",
    "APPLE_CLIENT_SECRET",
    "GEO_HEADER_COUNTRY",
    "GEO_HEADER_REGION",
    "GEO_HEADER_CITY",
    "OPENAI_API_KEY",
    "PYTHON_TTS_URL",
    "PYTHON_TTS_TIMEOUT_MS",
    "DIGEST_INTERNAL_SCHEDULER_ENABLED",
    "DIGEST_SCHEDULER_TICK_MS",
    "DIGEST_SCHEDULER_SECRET",
    "DIGEST_RUN_MAX_RETRY_ATTEMPTS",
    "DIGEST_SUMMARY_PROVIDER",
    "DIGEST_SUMMARY_PROXY_URL",
    "DIGEST_SUMMARY_TIMEOUT_MS",
    "AZURE_OPENAI_BASE_URL",
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_SUMMARY_NANO_DEPLOYMENT",
    "AZURE_OPENAI_SUMMARY_MINI_DEPLOYMENT",
    "DIGEST_EMAIL_PROVIDER",
    "TTS_WORKERS",
    "ANALYTICS_STORAGE_MODE",
    "JOB_EVENT_STORAGE_MODE",
    "DEMO_EXTRACTION_TRACE_ENABLED",
    "METADATA_PRIMARY_BACKEND",
    "METADATA_MIRROR_BACKEND",
    "METADATA_MIRROR_DUAL_WRITE",
    "METADATA_CANARY_COMPARE",
    "WORKER_QUEUE_PRESSURE_SOURCE",
    "AZURE_TABLE_CONNECTION_STRING",
    "AZURE_TABLE_ACCOUNT_URL",
    "AZURE_TABLE_SAS_TOKEN",
    "AZURE_TABLE_PREFIX",
    "AZURE_TABLE_CREATE_TABLES"
  ];

  if (profile === "simple") {
    return {
      required: ["DATABASE_URL", "APP_URL"],
      optional: [
        ...commonOptional,
        "MEDIA_ROOT",
        "UPLOAD_ROOT",
        "STORAGE_BACKEND",
        "STORAGE_ROOT"
      ]
    };
  }

  if (profile === "parity") {
    return {
      required: [
        "DATABASE_URL",
        "APP_URL",
        "STORAGE_BACKEND",
        "AZURE_STORAGE_CONNECTION_STRING",
        "AZURE_STORAGE_CONTAINER",
        "DIGEST_SCHEDULER_SECRET",
        "MEDIA_SIGNING_KEY",
        "PYTHON_TTS_URL"
      ],
      optional: [...commonOptional, "RUNTIME_PROFILE", "WORKER_POLL_MS", "WORKER_STALE_PROCESSING_MS"]
    };
  }

  return {
    required: ["APP_URL", "STORAGE_BACKEND", "AZURE_STORAGE_CONTAINER", "MEDIA_SIGNING_KEY"],
    optional: [
      ...commonOptional,
      "DATABASE_URL",
      "AZURE_STORAGE_CONNECTION_STRING",
      "AZURE_STORAGE_ACCOUNT_URL",
      "AZURE_STORAGE_SAS_TOKEN",
      "RUNTIME_PROFILE",
      "WORKER_POLL_MS",
      "WORKER_STALE_PROCESSING_MS"
    ]
  };
}

function run() {
  const { profile } = parseArgs();
  const env = getEffectiveEnv(profile);
  const { required, optional } = profileRequirements(profile);

  const missingRequired = required.filter((key) => !env[key] || String(env[key]).trim() === "");
  if (missingRequired.length > 0) {
    console.error(`[check-env] Missing required vars for profile '${profile}': ${missingRequired.join(", ")}`);
    process.exit(1);
  }

  if (profile === "simple") {
    if (env.STORAGE_BACKEND && env.STORAGE_BACKEND !== "local" && env.STORAGE_BACKEND !== "azure_blob") {
      console.error("[check-env] STORAGE_BACKEND must be either 'local' or 'azure_blob'.");
      process.exit(1);
    }
  } else if (env.STORAGE_BACKEND !== "azure_blob") {
    console.error(`[check-env] profile '${profile}' requires STORAGE_BACKEND=azure_blob for parity with Azure durable storage.`);
    process.exit(1);
  }

  if (profile === "azure") {
    const hasConnString = Boolean(env.AZURE_STORAGE_CONNECTION_STRING);
    const hasAccountPair = Boolean(env.AZURE_STORAGE_ACCOUNT_URL && env.AZURE_STORAGE_SAS_TOKEN);
    if (!hasConnString && !hasAccountPair) {
      console.error(
        "[check-env] Azure profile requires AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_URL + AZURE_STORAGE_SAS_TOKEN."
      );
      process.exit(1);
    }
  }

  if (env.DIGEST_SUMMARY_PROVIDER === "proxy" && (!env.DIGEST_SUMMARY_PROXY_URL || String(env.DIGEST_SUMMARY_PROXY_URL).trim() === "")) {
    console.error("[check-env] DIGEST_SUMMARY_PROVIDER=proxy requires DIGEST_SUMMARY_PROXY_URL.");
    process.exit(1);
  }

  if (env.DIGEST_SUMMARY_PROVIDER === "azure_openai") {
    const requiredAzureSummaryVars = [
      "AZURE_OPENAI_BASE_URL",
      "AZURE_OPENAI_API_KEY",
      "AZURE_OPENAI_SUMMARY_NANO_DEPLOYMENT",
      "AZURE_OPENAI_SUMMARY_MINI_DEPLOYMENT"
    ];
    const missingAzureSummaryVars = requiredAzureSummaryVars.filter((key) => !env[key] || String(env[key]).trim() === "");
    if (missingAzureSummaryVars.length > 0) {
      console.error(
        `[check-env] DIGEST_SUMMARY_PROVIDER=azure_openai requires: ${missingAzureSummaryVars.join(", ")}`
      );
      process.exit(1);
    }
  }

  if (env.METADATA_PRIMARY_BACKEND && !["prisma", "azure_table"].includes(env.METADATA_PRIMARY_BACKEND)) {
    console.error("[check-env] METADATA_PRIMARY_BACKEND must be either 'prisma' or 'azure_table'.");
    process.exit(1);
  }

  const usesAzureTable = env.METADATA_PRIMARY_BACKEND === "azure_table" || env.METADATA_MIRROR_BACKEND === "azure_table";
  if (!usesAzureTable && (!env.DATABASE_URL || String(env.DATABASE_URL).trim() === "")) {
    console.error("[check-env] Non-Azure-Table metadata modes require DATABASE_URL.");
    process.exit(1);
  }
  if (usesAzureTable) {
    const hasTableConnString = Boolean(env.AZURE_TABLE_CONNECTION_STRING);
    const hasTableAccountPair = Boolean(env.AZURE_TABLE_ACCOUNT_URL && env.AZURE_TABLE_SAS_TOKEN);
    if (!hasTableConnString && !hasTableAccountPair) {
      console.error(
        "[check-env] Azure Table metadata mode requires AZURE_TABLE_CONNECTION_STRING or AZURE_TABLE_ACCOUNT_URL + AZURE_TABLE_SAS_TOKEN."
      );
      process.exit(1);
    }
  }

  const missingOptional = optional.filter((key) => !env[key] || String(env[key]).trim() === "");

  if (!fs.existsSync("./apps/web/prisma/schema.prisma")) {
    console.error("[check-env] Prisma schema is missing at apps/web/prisma/schema.prisma");
    process.exit(1);
  }

  console.log(`[check-env] profile=${profile}`);
  console.log("[check-env] required vars: OK");
  console.log(`[check-env] optional vars not set: ${missingOptional.join(", ") || "none"}`);
  console.log("[check-env] Environment check completed.");
}

run();
