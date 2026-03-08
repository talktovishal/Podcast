import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { webPrimaryStore, webUsesAzureTablePrimary } from "../src/lib/metadata-primary-store";
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

  const usingAzureTablePrimary = webUsesAzureTablePrimary() && webPrimaryStore;

  const snapshot = usingAzureTablePrimary
    ? await (async () => {
        const store = webPrimaryStore;
        if (!store) {
          throw new Error("METADATA_PRIMARY_BACKEND=azure_table is set, but Azure Table primary store is not configured.");
        }

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
          store.countUsers(),
          store.countItems(),
          store.countEpisodes(),
          store.countItems("READY"),
          store.countItems("FAILED"),
          store.countJobs(),
          store.countFeedTokens("item"),
          store.countExtensionTokens(),
          prisma.demoExtractionTrace.count(),
          store.listRecentEpisodes(200)
        ]);

        return {
          metadataBackend: "azure_table",
          durableCountKeys: ["users", "items", "episodes", "readyItems", "failedItems", "jobs", "feedTokens", "extensionTokens"],
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
        } as const;
      })()
    : await (async () => {
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

        return {
          metadataBackend: "prisma",
          durableCountKeys: [
            "users",
            "items",
            "episodes",
            "readyItems",
            "failedItems",
            "jobs",
            "feedTokens",
            "extensionTokens",
            "demoExtractionTraces"
          ],
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
        } as const;
      })();

  const payload = {
    capturedAt: new Date().toISOString(),
    metadataBackend: snapshot.metadataBackend,
    databaseUrl: process.env.DATABASE_URL || "unknown",
    durableCountKeys: snapshot.durableCountKeys,
    counts: snapshot.counts,
    episodes: snapshot.episodes
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
