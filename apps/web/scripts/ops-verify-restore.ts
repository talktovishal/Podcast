import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../src/lib/prisma";
import { getArtifactStorage } from "../src/lib/storage";

type Snapshot = {
  capturedAt: string;
  counts: {
    users: number;
    items: number;
    episodes: number;
    readyItems: number;
    failedItems: number;
    jobs: number;
    feedTokens: number;
    extensionTokens: number;
    demoExtractionTraces: number;
  };
  episodes: Array<{
    id: string;
    guid: string;
    itemId: string;
    audioPath: string;
    audioBytes: number;
    mimeType: string;
  }>;
};

function parseArgs(): { inFile: string } {
  const args = process.argv.slice(2);
  let inFile = "../../exports/ops/pre-drill-snapshot.json";

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--in") {
      inFile = args[i + 1] ?? inFile;
      i += 1;
    }
  }

  return { inFile: resolve(process.cwd(), inFile) };
}

async function main() {
  const { inFile } = parseArgs();
  const snapshot = JSON.parse(await readFile(inFile, "utf8")) as Snapshot;

  const [
    userCount,
    itemCount,
    episodeCount,
    readyItemCount,
    failedItemCount,
    jobCount,
    feedTokenCount,
    extensionTokenCount,
    demoTraceCount
  ] = await Promise.all([
    prisma.user.count(),
    prisma.item.count(),
    prisma.episode.count(),
    prisma.item.count({ where: { status: "READY" } }),
    prisma.item.count({ where: { status: "FAILED" } }),
    prisma.job.count(),
    prisma.feedToken.count(),
    prisma.extensionToken.count(),
    prisma.demoExtractionTrace.count()
  ]);

  const currentCounts = {
    users: userCount,
    items: itemCount,
    episodes: episodeCount,
    readyItems: readyItemCount,
    failedItems: failedItemCount,
    jobs: jobCount,
    feedTokens: feedTokenCount,
    extensionTokens: extensionTokenCount,
    demoExtractionTraces: demoTraceCount
  };

  for (const [key, before] of Object.entries(snapshot.counts)) {
    const now = currentCounts[key as keyof typeof currentCounts];
    if (now < before) {
      throw new Error(`Count regression detected for '${key}': before=${before}, now=${now}`);
    }
  }

  const storage = getArtifactStorage();
  for (const episode of snapshot.episodes) {
    const exists = await prisma.episode.findUnique({ where: { id: episode.id } });
    if (!exists) {
      throw new Error(`Missing episode '${episode.id}' (${episode.guid}) after restore.`);
    }

    const head = await storage.headObject(episode.audioPath).catch(() => null);
    if (!head || head.bytes <= 0) {
      throw new Error(`Missing audio object for episode '${episode.id}' at '${episode.audioPath}'.`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[ops-verify-restore] snapshot=${inFile}`);
  // eslint-disable-next-line no-console
  console.log(`[ops-verify-restore] counts OK ${JSON.stringify(currentCounts)}`);
  // eslint-disable-next-line no-console
  console.log(`[ops-verify-restore] verified ${snapshot.episodes.length} episode objects`);
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
