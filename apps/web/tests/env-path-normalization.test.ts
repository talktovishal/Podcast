import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function loadEnvSnapshot(input: {
  cwd: string;
  modulePath: string;
  exportName: string;
  includeUploadRoot?: boolean;
}): {
  databaseUrl: string | null;
  storageRoot: string;
  mediaRoot: string;
  uploadRoot?: string;
} {
  const moduleUrl = pathToFileURL(resolve(repoRoot, input.modulePath)).href;
  const fields = [
    "databaseUrl: snapshot.databaseUrl",
    "storageRoot: snapshot.storageRoot",
    "mediaRoot: snapshot.mediaRoot"
  ];
  if (input.includeUploadRoot) {
    fields.push("uploadRoot: snapshot.uploadRoot");
  }

  const script = `
    process.env.RUNTIME_PROFILE = "simple";
    process.env.DATABASE_URL = "file:./apps/web/.data/db.sqlite";
    process.env.STORAGE_ROOT = "./apps/web/.data/media";
    process.env.MEDIA_ROOT = "./apps/web/.data/media";
    process.env.UPLOAD_ROOT = "./apps/web/.data/uploads";
    (async () => {
      const module = await import(${JSON.stringify(moduleUrl)});
      const snapshot = module[${JSON.stringify(input.exportName)}];
      console.log(JSON.stringify({ ${fields.join(", ")} }));
    })().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;

  const result = spawnSync("npx", ["tsx", "--eval", script], {
    cwd: resolve(repoRoot, input.cwd),
    encoding: "utf8",
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Failed to load ${input.modulePath}`);
  }

  return JSON.parse(result.stdout.trim()) as {
    databaseUrl: string | null;
    storageRoot: string;
    mediaRoot: string;
    uploadRoot?: string;
  };
}

test("web and worker normalize repo-relative local paths to the same storage roots", () => {
  const expectedDatabaseUrl = `file:${resolve(repoRoot, "apps/web/.data/db.sqlite")}`;
  const expectedStorageRoot = resolve(repoRoot, "apps/web/.data/media");
  const expectedUploadRoot = resolve(repoRoot, "apps/web/.data/uploads");

  const webSnapshot = loadEnvSnapshot({
    cwd: "apps/web",
    modulePath: "apps/web/src/lib/env.ts",
    exportName: "env",
    includeUploadRoot: true
  });
  const workerSnapshot = loadEnvSnapshot({
    cwd: "apps/worker",
    modulePath: "apps/worker/src/lib/env.ts",
    exportName: "workerEnv"
  });

  assert.equal(webSnapshot.databaseUrl, expectedDatabaseUrl);
  assert.equal(workerSnapshot.databaseUrl, expectedDatabaseUrl);
  assert.equal(webSnapshot.storageRoot, expectedStorageRoot);
  assert.equal(workerSnapshot.storageRoot, expectedStorageRoot);
  assert.equal(webSnapshot.mediaRoot, expectedStorageRoot);
  assert.equal(workerSnapshot.mediaRoot, expectedStorageRoot);
  assert.equal(webSnapshot.uploadRoot, expectedUploadRoot);
});

test("azure table profile can omit DATABASE_URL for web and worker env snapshots", () => {
  const webModuleUrl = pathToFileURL(resolve(repoRoot, "apps/web/src/lib/env.ts")).href;
  const workerModuleUrl = pathToFileURL(resolve(repoRoot, "apps/worker/src/lib/env.ts")).href;

  const script = `
    delete process.env.DATABASE_URL;
    process.env.RUNTIME_PROFILE = "azure";
    process.env.METADATA_PRIMARY_BACKEND = "azure_table";
    process.env.STORAGE_BACKEND = "azure_blob";
    process.env.AZURE_STORAGE_CONTAINER = "articlepod";
    process.env.MEDIA_SIGNING_KEY = "12345678901234567890123456789012";
    process.env.DIGEST_SCHEDULER_SECRET = "12345678901234567890123456789012";
    (async () => {
      const webModule = await import(${JSON.stringify(webModuleUrl)});
      const workerModule = await import(${JSON.stringify(workerModuleUrl)});
      console.log(JSON.stringify({
        webDatabaseUrl: webModule.env.databaseUrl,
        workerDatabaseUrl: workerModule.workerEnv.databaseUrl
      }));
    })().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;

  const result = spawnSync("npx", ["tsx", "--eval", script], {
    cwd: resolve(repoRoot, "apps/web"),
    encoding: "utf8",
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to load azure env snapshot");
  }

  const snapshot = JSON.parse(result.stdout.trim()) as {
    webDatabaseUrl: string | null;
    workerDatabaseUrl: string | null;
  };

  assert.equal(snapshot.webDatabaseUrl, null);
  assert.equal(snapshot.workerDatabaseUrl, null);
});

test("azure table feedback store works without DATABASE_URL", () => {
  const feedbackModuleUrl = pathToFileURL(resolve(repoRoot, "apps/web/src/lib/feedback-store.ts")).href;
  const metadataModuleUrl = pathToFileURL(resolve(repoRoot, "apps/web/src/lib/metadata-primary-store.ts")).href;

  const script = `
    delete process.env.DATABASE_URL;
    process.env.RUNTIME_PROFILE = "azure";
    process.env.METADATA_PRIMARY_BACKEND = "azure_table";
    process.env.STORAGE_BACKEND = "azure_blob";
    process.env.AZURE_STORAGE_CONTAINER = "articlepod";
    process.env.AZURE_TABLE_CONNECTION_STRING = "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=ZmFrZQ==;EndpointSuffix=core.windows.net";
    process.env.AZURE_TABLE_CREATE_TABLES = "0";
    process.env.MEDIA_SIGNING_KEY = "12345678901234567890123456789012";
    process.env.DIGEST_SCHEDULER_SECRET = "12345678901234567890123456789012";
    (async () => {
      const feedbackModule = await import(${JSON.stringify(feedbackModuleUrl)});
      const metadataModule = await import(${JSON.stringify(metadataModuleUrl)});
      console.log(JSON.stringify({
        usesAzureTablePrimary: metadataModule.webUsesAzureTablePrimary(),
        hasPrimaryStore: Boolean(metadataModule.webPrimaryStore),
        hasCreateFeedback: typeof feedbackModule.createFeedback === "function",
        hasListFeedbackForAdmin: typeof feedbackModule.listFeedbackForAdmin === "function"
      }));
    })().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;

  const result = spawnSync("npx", ["tsx", "--eval", script], {
    cwd: resolve(repoRoot, "apps/web"),
    encoding: "utf8",
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to exercise azure feedback store");
  }

  const snapshot = JSON.parse(result.stdout.trim()) as {
    usesAzureTablePrimary: boolean;
    hasPrimaryStore: boolean;
    hasCreateFeedback: boolean;
    hasListFeedbackForAdmin: boolean;
  };

  assert.deepEqual(snapshot, {
    usesAzureTablePrimary: true,
    hasPrimaryStore: true,
    hasCreateFeedback: true,
    hasListFeedbackForAdmin: true
  });
});
