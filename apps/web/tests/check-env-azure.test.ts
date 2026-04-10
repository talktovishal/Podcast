import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function runCheckEnv(extraEnv: Record<string, string | undefined>) {
  return spawnSync("node", ["scripts/check-env.mjs", "--profile", "azure"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      APP_URL: "https://articlepod.com",
      DIGEST_SUMMARY_PROVIDER: "stub",
      STORAGE_BACKEND: "azure_blob",
      AZURE_STORAGE_CONTAINER: "articlepod",
      AZURE_STORAGE_CONNECTION_STRING:
        "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=ZmFrZQ==;EndpointSuffix=core.windows.net",
      AZURE_TABLE_CONNECTION_STRING:
        "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=ZmFrZQ==;EndpointSuffix=core.windows.net",
      MEDIA_SIGNING_KEY: "12345678901234567890123456789012",
      DIGEST_SCHEDULER_SECRET: "12345678901234567890123456789012",
      ...extraEnv
    }
  });
}

test("azure env check allows DATABASE_URL to be omitted in azure_table mode", () => {
  const result = runCheckEnv({
    RUNTIME_PROFILE: "azure",
    METADATA_PRIMARY_BACKEND: "azure_table",
    METADATA_MIRROR_BACKEND: "none",
    DATABASE_URL: ""
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("azure env check still requires DATABASE_URL in prisma metadata mode", () => {
  const result = runCheckEnv({
    RUNTIME_PROFILE: "azure",
    METADATA_PRIMARY_BACKEND: "prisma",
    METADATA_MIRROR_BACKEND: "none",
    DATABASE_URL: ""
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr || result.stdout, /DATABASE_URL/i);
});
