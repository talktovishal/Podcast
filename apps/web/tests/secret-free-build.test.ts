import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const envUrl = new URL("../src/lib/env.ts", import.meta.url).href;
const primaryUrl = new URL("../src/lib/metadata-primary-store.ts", import.meta.url).href;
const mirrorUrl = new URL("../src/lib/metadata-mirror.ts", import.meta.url).href;
const instrumentationUrl = new URL("../src/instrumentation.ts", import.meta.url).href;
const hostEnvironmentNames = new Set([
  "PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA"
]);

function run(script: string, overrides: Record<string, string> = {}) {
  const hostEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => hostEnvironmentNames.has(key.toUpperCase()))
  );
  return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: webRoot,
    encoding: "utf8",
    timeout: 15_000,
    env: {
      ...hostEnvironment,
      NODE_ENV: "production",
      RUNTIME_PROFILE: "azure",
      STORAGE_BACKEND: "azure_blob",
      METADATA_PRIMARY_BACKEND: "azure_table",
      METADATA_MIRROR_BACKEND: "azure_table",
      METADATA_MIRROR_DUAL_WRITE: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      ...overrides
    }
  });
}

test("Next build imports keep Azure primary and mirror enabled without credentials", () => {
  const result = run(`
    const { env } = await import(${JSON.stringify(envUrl)});
    const { webPrimaryStore } = await import(${JSON.stringify(primaryUrl)});
    const { webMetadataMirror } = await import(${JSON.stringify(mirrorUrl)});
    console.log(JSON.stringify({
      profile: env.runtimeProfile,
      primary: webPrimaryStore.backend,
      mirror: webMetadataMirror.backend,
      mirrorEnabled: webMetadataMirror.enabled
    }));
  `, { NEXT_PHASE: "phase-production-build" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    profile: "azure", primary: "azure_table", mirror: "azure_table", mirrorEnabled: true
  });
});

test("runtime secret validation is not disabled by build support", () => {
  for (const phase of ["", "phase-production-server", "unrecognized-phase"]) {
    const result = run(`await import(${JSON.stringify(envUrl)});`, { NEXT_PHASE: phase });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /DIGEST_SCHEDULER_SECRET must be set/);
  }
  const missingMedia = run(`await import(${JSON.stringify(envUrl)});`, { DIGEST_SCHEDULER_SECRET: "fixture-scheduler" });
  assert.notEqual(missingMedia.status, 0);
  assert.match(missingMedia.stderr, /MEDIA_SIGNING_KEY must be set/);
});

test("runtime metadata construction still rejects missing Azure credentials", () => {
  for (const moduleUrl of [primaryUrl, mirrorUrl]) {
    const result = run(`await import(${JSON.stringify(moduleUrl)});`, {
      DIGEST_SCHEDULER_SECRET: "fixture-scheduler",
      MEDIA_SIGNING_KEY: "fixture-media"
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Azure Table (primary store|mirror) requires connection string/);
  }
});

test("build-time data access fails rather than silently using Prisma", () => {
  const result = run(`
    const { webPrimaryStore } = await import(${JSON.stringify(primaryUrl)});
    await webPrimaryStore.findUserById("fixture-user");
  `, { NEXT_PHASE: "phase-production-build" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Azure Table primary store requires connection string/);
});

test("build instrumentation never bootstraps accounts or starts keepalive", () => {
  const result = run(`
    const { register } = await import(${JSON.stringify(instrumentationUrl)});
    await register();
    console.log(JSON.stringify({ keepaliveStarted: Boolean(globalThis.__articlepodServerKeepalive__) }));
  `, {
    NEXT_PHASE: "phase-production-build",
    NEXT_RUNTIME: "nodejs",
    ARTICLEPOD_BOOTSTRAP_ADMIN_ON_STARTUP: "1",
    ARTICLEPOD_SERVER_KEEPALIVE: "1"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { keepaliveStarted: false });
});
