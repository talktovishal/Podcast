#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolvePrismaSchemaPath } from "./prisma-profile.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const cacheDir = path.resolve(repoRoot, ".cache");
const cachePath = path.resolve(cacheDir, "prisma-generate-state.json");
const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    force: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--force") {
      options.force = true;
    }
  }

  return options;
}

function loadCache() {
  if (!fs.existsSync(cachePath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

function schemaSignature() {
  const schemaPath = resolvePrismaSchemaPath();
  const absoluteSchemaPath = path.isAbsolute(schemaPath) ? schemaPath : path.resolve(repoRoot, schemaPath);
  const stats = fs.statSync(absoluteSchemaPath);
  let prismaClientVersion = "unknown";
  try {
    const packageJsonPath = require.resolve("@prisma/client/package.json");
    prismaClientVersion = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version || prismaClientVersion;
  } catch {
    // Missing package state is handled by generatedClientExists().
  }
  return {
    schemaPath: absoluteSchemaPath,
    schemaMtimeMs: stats.mtimeMs,
    prismaClientVersion
  };
}

function generatedClientExists() {
  const packageRoots = [
    process.cwd(),
    path.resolve(repoRoot, "apps/web"),
    path.resolve(repoRoot, "apps/worker")
  ];

  for (const packageRoot of packageRoots) {
    try {
      const localRequire = createRequire(path.resolve(packageRoot, "package.json"));
      localRequire.resolve("@prisma/client");
      return true;
    } catch {
      // Try the next workspace root.
    }
  }

  try {
    const prismaStoreDir = path.resolve(repoRoot, "node_modules/.pnpm");
    const entry = fs
      .readdirSync(prismaStoreDir)
      .find((name) => name.startsWith("@prisma+client@"));

    return Boolean(
      entry &&
        fs.existsSync(path.resolve(prismaStoreDir, entry, "node_modules/@prisma/client/index.js"))
    );
  } catch {
    try {
      require.resolve("@prisma/client");
      return true;
    } catch {
      return false;
    }
  }
}

function runGenerate() {
  const result = spawnSync("node", ["scripts/prisma-profile.mjs", "generate"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const options = parseArgs(process.argv);
  const cache = loadCache();
  const signature = schemaSignature();
  const cacheKey = `${process.env.RUNTIME_PROFILE || "simple"}:${process.env.METADATA_PRIMARY_BACKEND || "prisma"}`;
  const cached = cache[cacheKey];

  const needsGenerate =
    options.force ||
    !generatedClientExists() ||
    !cached ||
    cached.schemaPath !== signature.schemaPath ||
    cached.schemaMtimeMs !== signature.schemaMtimeMs ||
    cached.prismaClientVersion !== signature.prismaClientVersion;

  if (!needsGenerate) {
    console.log(`[ensure-prisma-generated] up to date for ${cacheKey}`);
    return;
  }

  console.log(`[ensure-prisma-generated] generating Prisma client for ${cacheKey}`);
  runGenerate();

  cache[cacheKey] = signature;
  saveCache(cache);
}

main();
