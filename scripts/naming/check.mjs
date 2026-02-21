import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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

const SKIP_DIRS = new Set([".git", "node_modules", ".runtime", "dist"]);
const LEGACY_PATTERN = /(listenlater|@listenlater\/)/;

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

const violations = [];
for (const filePath of walkFiles(repoRoot)) {
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
