#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { computeScope } from "./ci-scope.mjs";

function run(command) {
  console.log(`> ${command}`);
  execSync(command, { stdio: "inherit" });
}

function runBestEffort(command) {
  try {
    run(command);
  } catch (error) {
    console.warn(`[preflight] best-effort command failed: ${command}`);
  }
}

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.status !== 0) {
    if (allowFailure) {
      return "";
    }
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }

  return (result.stdout || "").trim();
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    base: "",
    includeParity: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--base") {
      options.base = args[index + 1] || "";
      index += 1;
    } else if (arg === "--parity") {
      options.includeParity = true;
    }
  }

  return options;
}

function resolveBaseRef(explicitBase) {
  if (explicitBase) {
    return explicitBase;
  }

  const currentBranch = git(["branch", "--show-current"], true);
  if (currentBranch && currentBranch !== "main" && git(["rev-parse", "--verify", "origin/main"], true)) {
    return "origin/main";
  }

  if (git(["rev-parse", "--verify", "HEAD~1"], true)) {
    return "HEAD~1";
  }

  return "HEAD";
}

function resolveChangedFiles(baseRef) {
  const changed = new Set();

  for (const line of git(["diff", "--name-only", `${baseRef}...HEAD`], true).split("\n")) {
    if (line.trim()) {
      changed.add(line.trim());
    }
  }

  for (const line of git(["diff", "--name-only", "HEAD"], true).split("\n")) {
    if (line.trim()) {
      changed.add(line.trim());
    }
  }

  for (const line of git(["ls-files", "--others", "--exclude-standard"], true).split("\n")) {
    if (line.trim()) {
      changed.add(line.trim());
    }
  }

  return [...changed].sort();
}

function commandSucceeds(command, args) {
  const result = spawnSync(command, args, {
    stdio: "ignore"
  });
  return result.status === 0;
}

function main() {
  const options = parseArgs(process.argv);
  const baseRef = resolveBaseRef(options.base);
  const scope = computeScope(resolveChangedFiles(baseRef));

  console.log(`[preflight] base=${baseRef}`);
  console.log(`[preflight] ${scope.summary}`);

  if (!scope.has_changes) {
    console.log("[preflight] No local changes to validate.");
    return;
  }

  if (scope.docs_only) {
    console.log("[preflight] Docs-only change, skipping code validation.");
    return;
  }

  const commands = [];

  if (scope.run_env_simple) {
    commands.push("node scripts/check-env.mjs --profile simple");
  }
  if (scope.run_naming) {
    commands.push("node scripts/naming/check.mjs");
  }
  if (scope.run_core) {
    commands.push("node --test scripts/ci-scope.test.mjs");
    commands.push("corepack pnpm --filter @articlepod/core run typecheck");
    commands.push("corepack pnpm --filter @articlepod/core run test");
    commands.push("corepack pnpm --filter @articlepod/core run build");
  }
  if (scope.run_web) {
    commands.push("corepack pnpm --filter @articlepod/web run typecheck");
    commands.push("corepack pnpm --filter @articlepod/web run lint");
    commands.push("corepack pnpm --filter @articlepod/web run test");
    commands.push("corepack pnpm --filter @articlepod/web run build");
  }
  if (scope.run_worker) {
    commands.push("corepack pnpm --filter @articlepod/worker run typecheck");
    commands.push("corepack pnpm --filter @articlepod/worker run test");
    commands.push("corepack pnpm --filter @articlepod/worker run build");
  }
  if (scope.run_testing) {
    commands.push("corepack pnpm --filter @articlepod/live-site run typecheck");
    commands.push("corepack pnpm --filter @articlepod/live-site run test");
    commands.push("corepack pnpm --filter @articlepod/extraction-quality run typecheck");
    commands.push("corepack pnpm --filter @articlepod/extraction-quality run test");
  }
  if (scope.run_observability) {
    commands.push("node scripts/observability-verify.mjs");
  }
  if (scope.run_export) {
    commands.push("corepack pnpm export");
  }
  if (scope.run_license) {
    commands.push("node scripts/license-check.mjs");
  }

  for (const command of commands) {
    run(command);
  }

  if (scope.run_parity) {
    if (options.includeParity) {
      if (!commandSucceeds("docker", ["info"])) {
        throw new Error(
          "[preflight] Docker daemon is unavailable. Start Docker/Colima before running `pnpm preflight --parity`, or rely on CI parity."
        );
      }

      try {
        run("corepack pnpm parity:up");
        run("corepack pnpm parity:smoke");
      } finally {
        runBestEffort("corepack pnpm parity:down");
      }
    } else {
      console.log("[preflight] Parity is recommended for this change. Run `pnpm preflight --parity` or rely on CI.");
    }
  }
}

if (basename(process.argv[1] || "") === basename(fileURLToPath(import.meta.url))) {
  main();
}
