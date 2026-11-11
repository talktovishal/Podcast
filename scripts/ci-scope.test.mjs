import test from "node:test";
import assert from "node:assert/strict";
import { computeScope } from "./ci-scope.mjs";

test("docs-only changes skip code validation", () => {
  const scope = computeScope(["docs/Prompts.md", "README.md"]);
  assert.equal(scope.docs_only, true);
  assert.equal(scope.run_simple, false);
  assert.equal(scope.run_parity, false);
});

test("marketing-only web changes avoid worker and parity", () => {
  const scope = computeScope(["apps/web/src/app/about/page.tsx"]);
  assert.equal(scope.run_web, true);
  assert.equal(scope.run_worker, false);
  assert.equal(scope.run_parity, false);
  assert.equal(scope.run_export, false);
  assert.equal(scope.run_observability, false);
});

test("shared core changes fan out to dependent checks", () => {
  const scope = computeScope(["packages/core/src/rss/buildFeed.ts"]);
  assert.equal(scope.run_core, true);
  assert.equal(scope.run_web, true);
  assert.equal(scope.run_worker, true);
  assert.equal(scope.run_testing, true);
  assert.equal(scope.run_parity, true);
  assert.equal(scope.run_export, true);
});

test("worker-only runtime changes trigger parity", () => {
  const scope = computeScope(["apps/worker/src/jobs/processItemJob.ts"]);
  assert.equal(scope.run_worker, true);
  assert.equal(scope.run_web, false);
  assert.equal(scope.run_parity, true);
});

test("python TTS changes run model-free service tests", () => {
  assert.equal(computeScope(["services/python-tts/app/main.py"]).run_python_tts, true);
  assert.equal(computeScope([".github/workflows/ci.yml"]).run_python_tts, true);
  assert.equal(computeScope(["docs/architecture.md"]).run_python_tts, false);
  assert.equal(computeScope(["apps/web/src/app/about/page.tsx"]).run_python_tts, false);
});
