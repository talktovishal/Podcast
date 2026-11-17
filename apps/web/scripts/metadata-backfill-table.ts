import { webPrimaryStore, webUsesAzureTablePrimary } from "../src/lib/metadata-primary-store";
import { createWebMetadataMirror } from "../src/lib/metadata-mirror";
import type { AzureTablePrimaryBackfillConfig } from "../src/lib/ops/azure-table-primary-backfill";
import { azureTablePrimaryBackfillConfigs } from "../src/lib/ops/azure-table-primary-backfill";
import { prisma } from "../src/lib/prisma";

const PAGE_SIZE = 250;

async function backfillPrimaryModel(config: AzureTablePrimaryBackfillConfig): Promise<number> {
  if (!webUsesAzureTablePrimary() || !webPrimaryStore) {
    throw new Error("Azure Table primary store is not enabled. Set METADATA_PRIMARY_BACKEND=azure_table and table credentials.");
  }
  const store = webPrimaryStore;

  let lastCursor: string | undefined;
  let total = 0;

  while (true) {
    const delegate = (prisma as Record<string, any>)[config.delegate];
    const rows = await delegate.findMany({
      where: lastCursor
        ? {
            [config.orderByField]: {
              gt: lastCursor
            }
          }
        : undefined,
      orderBy: {
        [config.orderByField]: "asc"
      },
      take: PAGE_SIZE,
      ...(config.select ? { select: config.select } : {})
    });

    if (rows.length === 0) {
      break;
    }

    await Promise.all(rows.map((row: Record<string, any>) => store.upsertRawEntity(config.tableKey, config.buildEntity(row))));
    total += rows.length;
    lastCursor = rows[rows.length - 1]?.[config.orderByField];
  }

  return total;
}

async function backfillItems(): Promise<number> {
  const mirror = createWebMetadataMirror(true);
  let lastId: string | undefined;
  let total = 0;

  while (true) {
    const items = await prisma.item.findMany({
      where: lastId ? { id: { gt: lastId } } : undefined,
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        userId: true,
        sourceType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        errorCode: true,
        errorMessage: true
      }
    });

    if (items.length === 0) {
      break;
    }

    for (const item of items) {
      await mirror.upsertItemProjection(item);
      total++;
    }

    lastId = items[items.length - 1]?.id;
  }

  return total;
}

async function backfillJobs(): Promise<number> {
  const mirror = createWebMetadataMirror(true);
  let lastId: string | undefined;
  let total = 0;

  while (true) {
    const jobs = await prisma.job.findMany({
      where: lastId ? { id: { gt: lastId } } : undefined,
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        itemId: true,
        status: true,
        attempt: true,
        createdAt: true,
        updatedAt: true,
        lockedAt: true,
        scheduledFor: true,
        nextRetryAt: true,
        errorCode: true,
        errorMessage: true
      }
    });

    if (jobs.length === 0) {
      break;
    }

    for (const job of jobs) {
      await mirror.upsertJobProjection(job);
      total++;
    }

    lastId = jobs[jobs.length - 1]?.id;
  }

  return total;
}

async function backfillDigestRuns(): Promise<number> {
  const mirror = createWebMetadataMirror(true);
  let lastId: string | undefined;
  let total = 0;

  while (true) {
    const runs = await prisma.digestRun.findMany({
      where: lastId ? { id: { gt: lastId } } : undefined,
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        userId: true,
        cadence: true,
        periodKey: true,
        status: true,
        attempt: true,
        createdAt: true,
        updatedAt: true,
        scheduledFor: true,
        lockedAt: true,
        nextRetryAt: true,
        errorCode: true,
        errorMessage: true
      }
    });

    if (runs.length === 0) {
      break;
    }

    for (const run of runs) {
      await mirror.upsertDigestRunProjection(run);
      total++;
    }

    lastId = runs[runs.length - 1]?.id;
  }

  return total;
}

async function backfillPrimaryStore(): Promise<void> {
  const counts = Object.fromEntries(
    await Promise.all(
      azureTablePrimaryBackfillConfigs.map(async (config) => {
        const total = await backfillPrimaryModel(config);
        return [config.modelName, total] as const;
      })
    )
  );

  // eslint-disable-next-line no-console
  console.log(`[metadata:backfill] completed mode=primary counts=${JSON.stringify(counts)}`);
}

async function main() {
  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    await backfillPrimaryStore();
    return;
  }

  const mirror = createWebMetadataMirror(true);
  if (!mirror.enabled) {
    throw new Error(
      "No Azure Table target is enabled. Set either METADATA_PRIMARY_BACKEND=azure_table or METADATA_MIRROR_BACKEND=azure_table."
    );
  }

  const [items, jobs, digestRuns] = await Promise.all([backfillItems(), backfillJobs(), backfillDigestRuns()]);
  // eslint-disable-next-line no-console
  console.log(
    `[metadata:backfill] completed mode=mirror items=${items} jobs=${jobs} digestRuns=${digestRuns} backend=${mirror.backend}`
  );
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[metadata:backfill] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
