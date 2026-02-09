#!/usr/bin/env node
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const repoRoot = resolve(process.cwd());
const logRoot = resolve(repoRoot, ".runtime/logs");
const outputFile = resolve(repoRoot, "exports/diagnostics/error-digest.md");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function collectLogFiles(root) {
  const files = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (entry.name.endsWith(".jsonl")) {
        files.push(path);
      }
    }
  }
  await walk(root);
  return files;
}

function toSignature(event) {
  return `${event.service || "unknown"}|${event.error_code || "NO_CODE"}|${event.msg || "(no message)"}`;
}

async function main() {
  if (!(await exists(logRoot))) {
    console.error(`log root does not exist: ${logRoot}`);
    process.exit(1);
  }

  const files = await collectLogFiles(logRoot);
  const grouped = new Map();

  for (const file of files) {
    const raw = await readFile(file, "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (!["ERROR", "FATAL", "WARN"].includes(event.level)) {
        continue;
      }
      const key = toSignature(event);
      const current = grouped.get(key) || {
        service: event.service || "unknown",
        errorCode: event.error_code || "NO_CODE",
        message: event.msg || "(no message)",
        count: 0,
        firstSeen: event.ts,
        lastSeen: event.ts,
        routes: new Set(),
        stages: new Set(),
      };
      current.count += 1;
      if (event.ts && event.ts < current.firstSeen) current.firstSeen = event.ts;
      if (event.ts && event.ts > current.lastSeen) current.lastSeen = event.ts;
      if (event.attrs?.route) current.routes.add(String(event.attrs.route));
      if (event.attrs?.stage) current.stages.add(String(event.attrs.stage));
      grouped.set(key, current);
    }
  }

  const top = [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 20);

  await mkdir(resolve(repoRoot, "exports/diagnostics"), { recursive: true });
  const md = [
    "# Error Digest",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Log root: ${logRoot}`,
    "",
    "## Top recurring errors",
    "",
  ];

  if (top.length === 0) {
    md.push("No WARN/ERROR/FATAL events found.");
  } else {
    for (const entry of top) {
      md.push(`### ${entry.service} :: ${entry.errorCode}`);
      md.push(`- Count: ${entry.count}`);
      md.push(`- First seen: ${entry.firstSeen}`);
      md.push(`- Last seen: ${entry.lastSeen}`);
      md.push(`- Message: ${entry.message}`);
      md.push(`- Routes: ${[...entry.routes].join(", ") || "(none)"}`);
      md.push(`- Stages: ${[...entry.stages].join(", ") || "(none)"}`);
      md.push(`- Suggested fix area: ${entry.service}`);
      md.push("");
    }
  }

  await writeFile(outputFile, md.join("\n"), "utf8");
  console.log(`wrote ${outputFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
