import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isAbsolute, resolve } from "node:path";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export function resolvePrismaSchemaPath({
  profile = process.env.RUNTIME_PROFILE || "simple",
  metadataPrimaryBackend = process.env.METADATA_PRIMARY_BACKEND || "prisma",
  prismaSchemaPath = process.env.PRISMA_SCHEMA_PATH
} = {}) {
  if (prismaSchemaPath) {
    return prismaSchemaPath;
  }

  if (profile === "parity") {
    return "apps/web/prisma/schema.postgres.prisma";
  }

  if (profile === "azure") {
    return metadataPrimaryBackend === "azure_table" ? "apps/web/prisma/schema.prisma" : "apps/web/prisma/schema.postgres.prisma";
  }

  return "apps/web/prisma/schema.prisma";
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return resolve(entry) === fileURLToPath(import.meta.url);
}

function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node scripts/prisma-profile.mjs <prisma-subcommand...>");
    process.exit(1);
  }

  const hasSchemaArg = args.some((arg) => arg === "--schema" || arg.startsWith("--schema="));
  const schemaPath = (() => {
    const path = resolvePrismaSchemaPath();
    return isAbsolute(path) ? path : resolve(repoRoot, path);
  })();
  const finalArgs = hasSchemaArg ? args : [...args, "--schema", schemaPath];

  const result = spawnSync("corepack", ["pnpm", "--filter", "@articlepod/web", "exec", "prisma", ...finalArgs], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (isMainModule()) {
  run();
}
