import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

function runStep(label, command, args) {
  process.stdout.write(`\n[extension:package] ${label}\n`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runStep("Running extension capture and snippet unit tests", "corepack", [
  "pnpm",
  "--filter",
  "@articlepod/core",
  "exec",
  "tsx",
  "--test",
  "tests/extension-capture.test.ts",
  "tests/extension-feedback.test.ts",
  "tests/extension-snippets.test.ts"
]);

runStep("Running extension auth and integration tests", "corepack", [
  "pnpm",
  "--filter",
  "@articlepod/web",
  "exec",
  "tsx",
  "--test",
  "tests/auth-routes.test.ts",
  "tests/auth-extension.integration.test.ts",
  "tests/app-dashboard-layout.test.ts"
]);

runStep("Running extension harness and packaging regression tests", "corepack", [
  "pnpm",
  "--filter",
  "@articlepod/live-site",
  "test"
]);

runStep("Building the packaged extension artifact", resolve(repoRoot, "scripts/package-extension.sh"), []);
runStep("Validating the packaged extension artifact", "node", ["scripts/validate-extension.mjs", "--zip"]);

process.stdout.write(
  "\n[extension:package] Package ready. For release sign-off, run `corepack pnpm extension:smoke:package` or `corepack pnpm extension:release:check`.\n"
);
