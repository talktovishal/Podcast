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

test("seed script can provision a dedicated Chrome Web Store reviewer without logging secrets", () => {
  const seedScriptPath = resolve(process.cwd(), "scripts/seed-demo.ts");
  const source = readFileSync(seedScriptPath, "utf8");

  assert.match(source, /WEBSTORE_REVIEWER_EMAIL = env\.webstoreReviewerEmail/);
  assert.match(source, /WEBSTORE_REVIEWER_PASSWORD = env\.webstoreReviewerPassword\?\./);
  assert.match(source, /setComplimentaryProAccess\(user\.id, input\.complimentaryPro\)/);
  assert.match(source, /Chrome Web Store reviewer: .*WEBSTORE_REVIEWER_PASSWORD env var/);
  assert.doesNotMatch(source, /Demo password:/);
  assert.doesNotMatch(source, /Feed URL:/);
});

test("seed script skips prisma disconnect when DATABASE_URL is unset", () => {
  const seedScriptPath = resolve(process.cwd(), "scripts/seed-demo.ts");
  const source = readFileSync(seedScriptPath, "utf8");

  assert.match(source, /import \{ hasPrismaDatabase, prisma \} from "\.\.\/src\/lib\/prisma";/);
  assert.match(source, /if \(hasPrismaDatabase\(\)\) \{\n\s+await prisma\.\$disconnect\(\);\n\s+\}/m);
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

test("run.sh exposes fast single-script local launcher options", () => {
  const root = resolve(process.cwd(), "../..");
  const runSource = readFileSync(resolve(root, "run.sh"), "utf8");
  const devSource = readFileSync(resolve(root, "scripts/dev.mjs"), "utf8");
  const packageSource = readFileSync(resolve(root, "package.json"), "utf8");
  const workerPackageSource = readFileSync(resolve(root, "apps/worker/package.json"), "utf8");

  assert.match(runSource, /Usage: \.\/run\.sh \[--web\] \[--fast\] \[--skip-bootstrap\] \[--clean\]/);
  assert.match(runSource, /--web\s+Start only the web app for the fastest UI loop\./);
  assert.match(runSource, /--fast\s+Skip env validation and app bootstrap, then start watchers immediately\./);
  assert.match(runSource, /--clean\s+Clear local dev caches before starting/);
  assert.match(runSource, /DEV_ARGS\+=\("--web-only"\)/);
  assert.match(runSource, /DEV_ARGS\+=\("--skip-bootstrap"\)/);
  assert.match(runSource, /exec node scripts\/dev\.mjs "\$\{DEV_ARGS\[@\]\}"/);

  assert.match(devSource, /const fastMode = process\.argv\.includes\('--fast'\);/);
  assert.match(devSource, /const skipBootstrap = fastMode \|\| process\.argv\.includes\('--skip-bootstrap'\);/);
  assert.match(devSource, /\[dev\] skipping prisma\/db\/demo bootstrap/);
  assert.match(devSource, /commandList\.push\(skipBootstrap \? 'npm run dev:fast --workspace @articlepod\/worker' : 'npm run dev --workspace @articlepod\/worker'\);/);
  assert.match(packageSource, /"dev:web": "node scripts\/dev\.mjs --web-only"/);
  assert.match(packageSource, /"dev:fast": "node scripts\/dev\.mjs --fast"/);
  assert.match(packageSource, /"dev:web:fast": "node scripts\/dev\.mjs --web-only --fast"/);
  assert.match(workerPackageSource, /"dev:fast": "tsx watch src\/index\.ts"/);
});

test("run-web launcher delegates to run.sh web mode for backwards compatibility", () => {
  const root = resolve(process.cwd(), "../..");
  const runWebSource = readFileSync(resolve(root, "run-web.sh"), "utf8");
  const devSource = readFileSync(resolve(root, "scripts/dev.mjs"), "utf8");

  assert.match(runWebSource, /exec \.\/run\.sh --web "\$@"/);
  assert.match(devSource, /const webOnly = process\.argv\.includes\('--web-only'\);/);
});

test("parity env fixtures and checks require runtime secrets", () => {
  const root = resolve(process.cwd(), "../..");
  const envSource = readFileSync(resolve(root, ".env.parity.example"), "utf8");
  const checkEnvSource = readFileSync(resolve(root, "scripts/check-env.mjs"), "utf8");

  assert.match(envSource, /^WEBSTORE_REVIEWER_EMAIL="chrome-reviewer@articlepod\.com"$/m);
  assert.match(envSource, /^WEBSTORE_REVIEWER_PASSWORD="local-dev-reviewer"$/m);
  assert.match(envSource, /^DIGEST_SCHEDULER_SECRET="[^"]+"/m);
  assert.match(envSource, /^MEDIA_SIGNING_KEY="[^"]+"/m);
  assert.match(
    checkEnvSource,
    /if \(profile === "parity"\) \{\n    return \{\n      required: \[\n(?:\s+"[^"]+",\n)+\s+"DIGEST_SCHEDULER_SECRET",\n\s+"MEDIA_SIGNING_KEY",/m
  );
});

test("azure deploy forwards optional reviewer secrets into the VM env render", () => {
  const root = resolve(process.cwd(), "../..");
  const workflowSource = readFileSync(resolve(root, ".github/workflows/deploy-azure.yml"), "utf8");
  const renderEnvSource = readFileSync(resolve(root, "scripts/azure/render-env.sh"), "utf8");

  assert.match(workflowSource, /WEBSTORE_REVIEWER_EMAIL: \$\{\{ secrets\.APP_WEBSTORE_REVIEWER_EMAIL \}\}/);
  assert.match(workflowSource, /WEBSTORE_REVIEWER_PASSWORD: \$\{\{ secrets\.APP_WEBSTORE_REVIEWER_PASSWORD \}\}/);
  assert.doesNotMatch(workflowSource, /--seed-mode always/);
  assert.match(renderEnvSource, /^WEBSTORE_REVIEWER_EMAIL=\$\{WEBSTORE_REVIEWER_EMAIL:-chrome-reviewer@articlepod\.com\}$/m);
  assert.match(renderEnvSource, /^WEBSTORE_REVIEWER_PASSWORD=\$\{WEBSTORE_REVIEWER_PASSWORD:-\}$/m);
});
