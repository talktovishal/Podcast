import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
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

const rgResult = spawnSync(
  "rg",
  [
  "-n",
  "--hidden",
  "--glob",
  "!.git",
  "--glob",
  "!node_modules/**",
  "--glob",
  "!.runtime/**",
  "--glob",
  "!dist/**",
  "(listenlater|@listenlater/)",
  "."
  ],
  {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8"
  }
);

if (rgResult.status !== 0 && rgResult.status !== 1) {
  const stderr = rgResult.stderr?.trim();
  const stdout = rgResult.stdout?.trim();
  if (stderr) {
    console.error(stderr);
  }
  if (stdout) {
    console.error(stdout);
  }
  process.exit(rgResult.status ?? 1);
}

const rgOutput = rgResult.stdout ?? "";

const violations = [];
for (const line of rgOutput.split(/\r?\n/)) {
  if (!line.trim()) {
    continue;
  }
  const [path] = line.split(":", 2);
  const normalized = relative(repoRoot, resolve(repoRoot, path));
  if (!allowlist.has(normalized)) {
    violations.push(line);
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
