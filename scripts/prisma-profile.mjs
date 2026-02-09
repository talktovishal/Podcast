import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const profile = process.env.RUNTIME_PROFILE || "simple";

function schemaForProfile() {
  if (process.env.PRISMA_SCHEMA_PATH) {
    return process.env.PRISMA_SCHEMA_PATH;
  }
  if (profile === "parity" || profile === "azure") {
    return "apps/web/prisma/schema.postgres.prisma";
  }
  return "apps/web/prisma/schema.prisma";
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/prisma-profile.mjs <prisma-subcommand...>");
  process.exit(1);
}

const hasSchemaArg = args.some((arg) => arg === "--schema" || arg.startsWith("--schema="));
const finalArgs = hasSchemaArg ? args : [...args, "--schema", schemaForProfile()];

const result = spawnSync("npx", ["prisma", ...finalArgs], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
