import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { prisma } from "../src/lib/prisma";
import { databaseSnapshotModelConfigs } from "../src/lib/ops/database-snapshot";

type ExportBundle = {
  formatVersion: number;
  exportedAt: string;
  sourceDatabaseUrl: string;
  counts: Record<string, number>;
  data: Record<string, unknown[]>;
};

function parseArgs(): { outFile: string } {
  const args = process.argv.slice(2);
  let outFile = "./.data/db-export.json";

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--out") {
      outFile = args[i + 1] ?? outFile;
      i += 1;
    }
  }

  return { outFile: resolve(process.cwd(), outFile) };
}

async function main() {
  const { outFile } = parseArgs();

  const data = Object.fromEntries(
    await Promise.all(
      databaseSnapshotModelConfigs.map(async (config) => {
        const delegate = (prisma as Record<string, any>)[config.delegate];
        const rows = await delegate.findMany({
          orderBy: {
            [config.orderByField]: "asc"
          }
        });
        return [config.exportKey, rows] as const;
      })
    )
  );

  const counts = Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.length]));

  const bundle: ExportBundle = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    sourceDatabaseUrl: process.env.DATABASE_URL || "unknown",
    counts,
    data
  };

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(bundle, null, 2), "utf8");

  // eslint-disable-next-line no-console
  console.log(`[db:export-json] wrote ${outFile}`);
  // eslint-disable-next-line no-console
  console.log(`[db:export-json] counts ${JSON.stringify(counts)}`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
