import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { prisma } from "../src/lib/prisma";

function parseArgs(): { outFile: string } {
  const args = process.argv.slice(2);
  let outFile = "../../exports/ops/pre-drill-snapshot.json";

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

  const [
    userCount,
    itemCount,
    episodeCount,
    readyItemCount,
    failedItemCount,
    jobCount,
    feedTokenCount,
    extensionTokenCount,
    demoTraceCount,
    episodes
  ] = await Promise.all([
    prisma.user.count(),
    prisma.item.count(),
    prisma.episode.count(),
    prisma.item.count({ where: { status: "READY" } }),
    prisma.item.count({ where: { status: "FAILED" } }),
    prisma.job.count(),
    prisma.feedToken.count(),
    prisma.extensionToken.count(),
    prisma.demoExtractionTrace.count(),
    prisma.episode.findMany({
      select: {
        id: true,
        guid: true,
        itemId: true,
        audioPath: true,
        audioBytes: true,
        mimeType: true,
        publishedAt: true
      },
      orderBy: { publishedAt: "desc" },
      take: 200
    })
  ]);

  const payload = {
    capturedAt: new Date().toISOString(),
    databaseUrl: process.env.DATABASE_URL || "unknown",
    counts: {
      users: userCount,
      items: itemCount,
      episodes: episodeCount,
      readyItems: readyItemCount,
      failedItems: failedItemCount,
      jobs: jobCount,
      feedTokens: feedTokenCount,
      extensionTokens: extensionTokenCount,
      demoExtractionTraces: demoTraceCount
    },
    episodes
  };

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(payload, null, 2), "utf8");

  // eslint-disable-next-line no-console
  console.log(`[ops-snapshot] wrote ${outFile}`);
  // eslint-disable-next-line no-console
  console.log(`[ops-snapshot] counts ${JSON.stringify(payload.counts)}`);
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
