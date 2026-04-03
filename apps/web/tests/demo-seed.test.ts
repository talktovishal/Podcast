import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getBundledDemoAudioBuffer, resolveDemoAudioStrategy } from "../src/lib/demo-seed";

test("resolveDemoAudioStrategy prefers fast audio for parity and CI runs", () => {
  assert.equal(resolveDemoAudioStrategy({ ci: "", runtimeProfile: "parity", platform: "linux" }), "fast");
  assert.equal(resolveDemoAudioStrategy({ ci: "true", platform: "linux" }), "fast");
});

test("resolveDemoAudioStrategy keeps native and provider defaults outside parity", () => {
  assert.equal(resolveDemoAudioStrategy({ ci: "", platform: "darwin", runtimeProfile: "simple" }), "native");
  assert.equal(resolveDemoAudioStrategy({ ci: "", platform: "linux", runtimeProfile: "simple" }), "provider");
});

test("bundled demo audio provides a reusable mp3 fixture for fast seeding", () => {
  const first = getBundledDemoAudioBuffer();
  const second = getBundledDemoAudioBuffer();

  assert.ok(first.byteLength > 2000);
  assert.equal(first.subarray(0, 3).toString("utf8"), "ID3");
  assert.notStrictEqual(first, second);
  assert.deepEqual(first, second);
});

test("seed demo fast path no longer shells out to ffmpeg", () => {
  const seedScriptPath = resolve(process.cwd(), "scripts/seed-demo.ts");
  const source = readFileSync(seedScriptPath, "utf8");

  assert.match(source, /if \(strategy === "fast"\) \{\n\s+return getBundledDemoAudioBuffer\(\);/m);
  assert.doesNotMatch(source, /run\("ffmpeg"/);
});

test("parity compose gives the web healthcheck a startup grace period", () => {
  const composePath = resolve(process.cwd(), "../..", "docker-compose.parity.yml");
  const source = readFileSync(composePath, "utf8");

  assert.match(
    source,
    /web:\n(?: {2}.+\n)+ {4}healthcheck:\n(?: {6}.+\n)* {6}start_period: 120s/m
  );
});

test("parity compose waits for azurite health before starting web and worker", () => {
  const composePath = resolve(process.cwd(), "../..", "docker-compose.parity.yml");
  const source = readFileSync(composePath, "utf8");

  assert.match(
    source,
    /azurite:\n(?: {2}.+\n)+ {4}healthcheck:\n(?: {6}.+\n)* {6}test: \["CMD-SHELL", "node -e \\"fetch\('http:\/\/127\.0\.0\.1:10000'\)\.then\(\(\)=>process\.exit\(0\)\)\.catch\(\(\)=>process\.exit\(1\)\)\\""\]/m
  );
  assert.match(
    source,
    /web:\n(?: {2}.+\n)+ {4}depends_on:\n(?: {6}.+\n)+ {6}azurite:\n {8}condition: service_healthy/m
  );
  assert.match(source, / {6}DIGEST_SCHEDULER_SECRET: \$\{DIGEST_SCHEDULER_SECRET\}/m);
  assert.match(source, / {6}MEDIA_SIGNING_KEY: \$\{MEDIA_SIGNING_KEY\}/m);
  assert.match(
    source,
    /worker:\n(?: {2}.+\n)+ {4}depends_on:\n(?: {6}.+\n)+ {6}azurite:\n {8}condition: service_healthy/m
  );
});

test("parity-up emits compose diagnostics when startup fails", () => {
  const scriptPath = resolve(process.cwd(), "../..", "scripts/parity-up.sh");
  const source = readFileSync(scriptPath, "utf8");

  assert.match(source, /startup failed, collecting docker compose diagnostics/);
  assert.match(source, /docker compose -f docker-compose\.parity\.yml logs --no-color --tail=200 web worker azurite postgres python-tts/);
});

test("web-only launcher bootstraps the simple env template and skips worker services", () => {
  const root = resolve(process.cwd(), "../..");
  const runWebSource = readFileSync(resolve(root, "run-web.sh"), "utf8");
  const devSource = readFileSync(resolve(root, "scripts/dev.mjs"), "utf8");

  assert.match(runWebSource, /Created \.env from \.env\.simple\.example/);
  assert.match(runWebSource, /npm run check:env -- --profile simple/);
  assert.match(runWebSource, /exec node scripts\/dev\.mjs --web-only/);
  assert.match(devSource, /const webOnly = process\.argv\.includes\('--web-only'\);/);
  assert.match(devSource, /if \(!webOnly\) \{\n\s+runOrFail\('npx', \['pnpm', '--filter', '@articlepod\/worker', 'run', 'prisma:generate'\]\);/m);
});

test("parity env fixtures and checks require runtime secrets", () => {
  const root = resolve(process.cwd(), "../..");
  const envSource = readFileSync(resolve(root, ".env.parity.example"), "utf8");
  const checkEnvSource = readFileSync(resolve(root, "scripts/check-env.mjs"), "utf8");

  assert.match(envSource, /^DIGEST_SCHEDULER_SECRET="[^"]+"/m);
  assert.match(envSource, /^MEDIA_SIGNING_KEY="[^"]+"/m);
  assert.match(
    checkEnvSource,
    /if \(profile === "parity"\) \{\n    return \{\n      required: \[\n(?:\s+"[^"]+",\n)+\s+"DIGEST_SCHEDULER_SECRET",\n\s+"MEDIA_SIGNING_KEY",/m
  );
});
