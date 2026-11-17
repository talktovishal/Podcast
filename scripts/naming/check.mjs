import { readFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const allowlistPath = resolve(repoRoot, "config/naming-legacy-allowlist.txt");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8",
    ...options
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    if (stderr) {
      console.error(stderr);
    }
    if (stdout) {
      console.error(stdout);
    }
    process.exit(result.status ?? 1);
  }

  return result.stdout ?? "";
}

run("node", ["scripts/naming/sync.mjs", "--check"]);

const allowlist = new Set(
  readFileSync(allowlistPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
);

const SKIP_DIRS = new Set([
  ".data",
  ".git",
  ".next",
  "node_modules",
  ".runtime",
  ".venv",
  ".turbo",
  ".worktrees",
  "coverage",
  "dist",
  "exports",
  "playwright-report",
  "test-results"
]);
const LEGACY_PATTERN = /(listenlater|@listenlater\/)/;
const ENV_FILE_PATTERN = /^\.env(\..+)?$/;

function shouldSkipPath(path) {
  const segments = path.split("/");
  if (segments.some((segment) => SKIP_DIRS.has(segment))) {
    return true;
  }

  return ENV_FILE_PATTERN.test(basename(path));
}

function listFiles() {
  return run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .filter((value) => !shouldSkipPath(value))
    .map((value) => resolve(repoRoot, value));
}

const violations = [];
for (const filePath of listFiles()) {
  const normalized = relative(repoRoot, filePath);
  if (allowlist.has(normalized)) {
    continue;
  }
  let content;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    // skip binary / unreadable files
    continue;
  }
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (LEGACY_PATTERN.test(lines[i])) {
      violations.push(`${normalized}:${i + 1}:${lines[i]}`);
    }
  }
}

if (violations.length > 0) {
  console.error("[naming:check] found non-allowlisted legacy naming references:");
  for (const violation of violations) {
    console.error(`  ${violation}`);
  }
  process.exit(1);
}

console.log("[naming:check] passed");
