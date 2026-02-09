#!/usr/bin/env node
import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const repoRoot = resolve(process.cwd());
const logRoot = resolve(repoRoot, ".runtime/logs");
const outDir = resolve(repoRoot, "exports/diagnostics");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const bundleDir = resolve(outDir, `logs-${stamp}`);

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dst) {
  await mkdir(dst, { recursive: true });
  await cp(src, dst, { recursive: true, force: true });
}

async function collectEnvSummary() {
  const names = [".env", ".env.simple.example", ".env.parity.example", ".env.azure.example"];
  const lines = [];
  for (const name of names) {
    const path = resolve(repoRoot, name);
    if (!(await exists(path))) {
      continue;
    }
    const raw = await readFile(path, "utf8");
    const keys = raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => line.split("=", 1)[0]);
    lines.push(`- ${name}: ${keys.join(", ")}`);
  }
  return lines.join("\n");
}

async function main() {
  if (!(await exists(logRoot))) {
    console.error(`log root does not exist: ${logRoot}`);
    process.exit(1);
  }

  await mkdir(bundleDir, { recursive: true });
  await copyDir(logRoot, join(bundleDir, "logs"));

  const envSummary = await collectEnvSummary();
  await writeFile(
    join(bundleDir, "metadata.md"),
    `# Diagnostics Bundle\n\n- Created: ${new Date().toISOString()}\n- Log root: ${logRoot}\n\n## Environment keys\n${envSummary || "(none found)"}\n`,
    "utf8"
  );

  const entries = await readdir(bundleDir);
  console.log(`collected diagnostics at ${bundleDir}`);
  console.log(`files: ${entries.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
