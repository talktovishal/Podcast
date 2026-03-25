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
  databaseUrl: string;
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
    databaseUrl: string;
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
