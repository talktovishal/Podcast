import { createWebMetadataMirror } from "../src/lib/metadata-mirror";
import { prisma } from "../src/lib/prisma";

async function loadPrismaQueueSnapshot(now: Date, maxRetryAttempts: number) {
  const [queuedJobs, retryableFailedJobs, processingJobs, oldestEligible] = await Promise.all([
    prisma.job.count({
      where: { status: "QUEUED" }
    }),
    prisma.job.count({
      where: {
        status: "FAILED",
        nextRetryAt: { lte: now },
        attempt: { lt: maxRetryAttempts }
      }
    }),
    prisma.job.count({
      where: {
        status: "PROCESSING"
      }
    }),
    prisma.job.findFirst({
      where: {
        OR: [
          { status: "QUEUED" },
          {
            status: "FAILED",
            nextRetryAt: { lte: now },
            attempt: { lt: maxRetryAttempts }
          }
        ]
      },
      orderBy: [{ createdAt: "asc" }],
      select: { createdAt: true }
    })
  ]);

  const oldestEligibleJobCreatedAt = oldestEligible?.createdAt ?? null;
  const oldestEligibleJobAgeMs = oldestEligibleJobCreatedAt ? Math.max(0, now.getTime() - oldestEligibleJobCreatedAt.getTime()) : 0;

  return {
    queuedJobs,
    retryableFailedJobs,
    processingJobs,
    eligibleJobs: queuedJobs + retryableFailedJobs,
    oldestEligibleJobCreatedAt,
    oldestEligibleJobAgeMs
  };
}

async function main() {
  const mirror = createWebMetadataMirror(true);
  if (!mirror.enabled) {
    throw new Error("Metadata mirror is not enabled. Set METADATA_MIRROR_BACKEND=azure_table and table credentials.");
  }

  const now = new Date();
  const maxRetryAttempts = Number(process.env.WORKER_MAX_RETRY_ATTEMPTS ?? 5);
  const [prismaSnapshot, mirrorSnapshot] = await Promise.all([
    loadPrismaQueueSnapshot(now, maxRetryAttempts),
    mirror.getQueuePressureSnapshot({ now, maxRetryAttempts })
  ]);

  if (!mirrorSnapshot) {
    throw new Error("Mirror snapshot is unavailable.");
  }

  const diffs = {
    queuedJobs: mirrorSnapshot.queuedJobs - prismaSnapshot.queuedJobs,
    retryableFailedJobs: mirrorSnapshot.retryableFailedJobs - prismaSnapshot.retryableFailedJobs,
    processingJobs: mirrorSnapshot.processingJobs - prismaSnapshot.processingJobs,
    eligibleJobs: mirrorSnapshot.eligibleJobs - prismaSnapshot.eligibleJobs,
    oldestEligibleJobAgeMs: mirrorSnapshot.oldestEligibleJobAgeMs - prismaSnapshot.oldestEligibleJobAgeMs
  };
  const maxAllowedDiff = Number(process.env.METADATA_CONSISTENCY_MAX_DIFF ?? 0);
  const pass =
    Math.abs(diffs.queuedJobs) <= maxAllowedDiff &&
    Math.abs(diffs.retryableFailedJobs) <= maxAllowedDiff &&
    Math.abs(diffs.processingJobs) <= maxAllowedDiff &&
    Math.abs(diffs.eligibleJobs) <= maxAllowedDiff;

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: pass,
        maxAllowedDiff,
        now: now.toISOString(),
        prisma: prismaSnapshot,
        mirror: mirrorSnapshot,
        diffs
      },
      null,
      2
    )
  );

  if (!pass) {
    process.exit(1);
  }
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[metadata:check] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
