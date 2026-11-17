import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("Docker context excludes local state and retains required inputs", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "articlepod-container-context-"));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const context = join(workspace, "context");
  const output = join(workspace, "output");
  await mkdir(context);
  await writeFile(join(context, ".dockerignore"), await readFile(join(repoRoot, ".dockerignore")));
  const required = [
    "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "turbo.json", "tsconfig.base.json",
    ".env.simple.example", ".env.parity.example", "Dockerfile.web", "Dockerfile.worker",
    "apps/web/package.json", "apps/web/prisma/schema.prisma", "apps/web/src/app/api/health/route.ts",
    "apps/worker/package.json", "apps/worker/src/index.ts", "apps/worker/src/lib/audio-synthesis.ts",
    "packages/core/package.json", "scripts/azure/run-next-server.mjs",
    "services/python-tts/requirements.txt", "services/python-tts/requirements.providers.txt",
    "services/python-tts/bootstrap_assets.py", "services/python-tts/app/main.py"
  ];
  const excluded = [
    ".env", ".env.local", ".env.production", "apps/web/.env.local", "apps/worker/.env",
    ".secrets-packaging-canary/value", "apps/web/.secrets-packaging-canary",
    ".runtime/state.json", "apps/web/.runtime/state.json", ".data/database.sqlite", "apps/worker/.data/job.json",
    ".cache/model.bin", ".pnpm-store/fixture", ".worktrees/fixture/source.ts",
    "services/python-tts/.venv/fixture", "services/python-tts/app/__pycache__/fixture.pyc",
    "services/python-tts/app/fixture.pyc", ".pytest_cache/fixture", "apps/web/test-results/fixture",
    "apps/web/playwright-report/fixture", "apps/web/node_modules/fixture", ".DS_Store"
  ];
  for (const path of required) {
    await mkdir(dirname(join(context, path)), { recursive: true });
    await writeFile(join(context, path), await readFile(join(repoRoot, path)));
  }
  for (const path of excluded) {
    await mkdir(dirname(join(context, path)), { recursive: true });
    await writeFile(join(context, path), "ARTICLEPOD_SYNTHETIC_PACKAGING_CANARY\n");
  }
  execFileSync("docker", [
    "buildx", "build", "--progress=plain", "--file", "-", "--output", `type=local,dest=${output}`, context
  ], {
    input: "FROM scratch\nCOPY . /context/\n", encoding: "utf8", timeout: 120_000,
    stdio: ["pipe", "pipe", "pipe"]
  });
  for (const path of required) {
    assert.deepEqual(await readFile(join(output, "context", path)), await readFile(join(repoRoot, path)), path);
  }
  for (const path of excluded) {
    await assert.rejects(access(join(output, "context", path)), { code: "ENOENT" }, path);
  }
});

test("relocated web and worker images contain required runtime files and start without checkout mounts", () => {
  for (const service of ["web", "worker"]) {
    const container = `articlepod-${service}`;
    const [state] = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }));
    assert.equal(state.State.Running, true, `${service} must be running`);
    assert.equal(state.Mounts.some((mount) => mount.Type === "bind"), false, "startup must not depend on host checkout files");
    const required = service === "web"
      ? ["apps/web/.next/BUILD_ID", "apps/web/.next/server", "apps/web/package.json", "scripts/azure/run-next-server.mjs"]
      : ["apps/worker/src/index.ts", "apps/worker/src/lib/audio-synthesis.ts", "apps/worker/package.json"];
    const inventoryCheck = `
      const assert = require("node:assert/strict");
      const fs = require("node:fs");
      for (const file of ${JSON.stringify(required)}) assert.ok(fs.existsSync("/app/" + file), file);
      for (const directory of ["/app", "/app/apps/web", "/app/apps/worker"]) {
        for (const name of fs.readdirSync(directory)) {
          assert.ok(!/^\\.env(?:\\.|$)/.test(name) || name.endsWith(".example"), "local environment file: " + name);
        }
      }
      require.resolve("@prisma/client", { paths: ["/app/apps/${service}"] });
      ${service === "worker" ? 'require.resolve("tsx", { paths: ["/app/apps/worker"] });' : ""}
    `;
    execFileSync("docker", ["run", "--rm", "--entrypoint", "node", state.Image, "-e", inventoryCheck], {
      encoding: "utf8", timeout: 60_000
    });
    const healthUrl = service === "web" ? "http://127.0.0.1:3000/api/health" : "http://127.0.0.1:3001/health";
    execFileSync("docker", ["exec", container, "node", "-e", `
      fetch(${JSON.stringify(healthUrl)}, { signal: AbortSignal.timeout(5000) }).then(async response => {
        if (!response.ok) throw new Error("health status " + response.status);
        const body = await response.json();
        if (${service === "web" ? "body.ok !== true" : "body.status !== 'ok' || body.stuckJobs < 0"}) {
          throw new Error("runtime dependencies unavailable");
        }
      }).catch(error => { console.error(error); process.exitCode = 1; });
    `], { encoding: "utf8", timeout: 15_000 });
  }
});
