import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function runtimeProfile(): "simple" | "parity" | "azure" {
  const raw = process.env.RUNTIME_PROFILE ?? "simple";
  if (raw === "parity" || raw === "azure") {
    return raw;
  }
  return "simple";
}

function defaultDatabaseUrl(profile: "simple" | "parity" | "azure"): string {
  if (profile === "simple") {
    return `file:${resolve(process.cwd(), ".data/db.sqlite")}`;
  }
  return "postgresql://articlepod:articlepod@127.0.0.1:5432/articlepod";
}

async function ensureSqlitePath(databaseUrl: string): Promise<void> {
  if (!databaseUrl.startsWith("file:")) {
    return;
  }
  const rawPath = databaseUrl.replace(/^file:/, "");
  const absolutePath = resolve(process.cwd(), rawPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  // Some environments fail `prisma db push` when the SQLite file does not exist yet.
  await writeFile(absolutePath, "", { flag: "a" });
}

async function main() {
  const profile = runtimeProfile();
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? defaultDatabaseUrl(profile);
  await ensureSqlitePath(process.env.DATABASE_URL);

  const generate = spawnSync("node", ["../../scripts/prisma-profile.mjs", "generate"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      RUNTIME_PROFILE: profile
    }
  });

  if (generate.status !== 0) {
    throw new Error("Failed to generate Prisma client for selected profile.");
  }

  const result = spawnSync("node", ["../../scripts/prisma-profile.mjs", "db", "push", "--accept-data-loss"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      RUNTIME_PROFILE: profile
    }
  });

  if (result.status !== 0) {
    throw new Error("Failed to bootstrap database with Prisma.");
  }

  // eslint-disable-next-line no-console
  console.log(`[db:bootstrap] complete (profile=${profile})`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
