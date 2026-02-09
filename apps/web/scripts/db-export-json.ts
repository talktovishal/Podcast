import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { prisma } from "../src/lib/prisma";

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

  const data = {
    users: await prisma.user.findMany({ orderBy: { id: "asc" } }),
    sessions: await prisma.session.findMany({ orderBy: { id: "asc" } }),
    feedTokens: await prisma.feedToken.findMany({ orderBy: { id: "asc" } }),
    shareTokens: await prisma.shareToken.findMany({ orderBy: { id: "asc" } }),
    items: await prisma.item.findMany({ orderBy: { id: "asc" } }),
    oauthIdentities: await prisma.oAuthIdentity.findMany({ orderBy: { id: "asc" } }),
    extensionConnectCodes: await prisma.extensionConnectCode.findMany({ orderBy: { id: "asc" } }),
    extensionTokens: await prisma.extensionToken.findMany({ orderBy: { id: "asc" } }),
    jobs: await prisma.job.findMany({ orderBy: { id: "asc" } }),
    jobEvents: await prisma.jobEvent.findMany({ orderBy: { id: "asc" } }),
    episodes: await prisma.episode.findMany({ orderBy: { id: "asc" } }),
    chunkCaches: await prisma.chunkCache.findMany({ orderBy: { id: "asc" } }),
    demoExtractionTraces: await prisma.demoExtractionTrace.findMany({ orderBy: { id: "asc" } })
  };

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
