import { createWebMetadataMirror } from "../src/lib/metadata-mirror";
import { prisma } from "../src/lib/prisma";

const PAGE_SIZE = 250;

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

async function main() {
  const mirror = createWebMetadataMirror(true);
  if (!mirror.enabled) {
    throw new Error("Metadata mirror is not enabled. Set METADATA_MIRROR_BACKEND=azure_table and table credentials.");
  }

  const [items, jobs, digestRuns] = await Promise.all([backfillItems(), backfillJobs(), backfillDigestRuns()]);
  // eslint-disable-next-line no-console
  console.log(
    `[metadata:backfill] completed items=${items} jobs=${jobs} digestRuns=${digestRuns} backend=${mirror.backend}`
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
