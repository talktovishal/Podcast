import { workerEnv } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { processNextQueuedJob } from "./jobs/processItemJob.js";
import { processNextQueuedDigestRun } from "./jobs/processDigestRunJob.js";
import { hasPendingDigestSchedulerTick, scheduleDigestRuns } from "./jobs/scheduleDigestRuns.js";
import { workerLogger } from "./lib/logger.js";

let lastDigestSchedulerTickAt = 0;

async function loop() {
  const processedItem = await processNextQueuedJob();
  if (processedItem) {
    return;
  }

  const now = Date.now();
  const internalSchedulerDue =
    workerEnv.digestInternalSchedulerEnabled && now - lastDigestSchedulerTickAt >= workerEnv.digestSchedulerTickMs;
  const externalTickDue = !internalSchedulerDue && (await hasPendingDigestSchedulerTick());
  if (internalSchedulerDue || externalTickDue) {
    await scheduleDigestRuns(false);
    lastDigestSchedulerTickAt = now;
  }

  const processedDigest = await processNextQueuedDigestRun();
  if (!processedDigest) {
    await new Promise((resolve) => setTimeout(resolve, workerEnv.pollMs));
  }
}

async function main() {
  await workerLogger.info("Worker starting", {
    pollMs: workerEnv.pollMs,
    retryPollMs: workerEnv.retryPollMs,
    digestInternalSchedulerEnabled: workerEnv.digestInternalSchedulerEnabled,
    digestSchedulerTickMs: workerEnv.digestSchedulerTickMs,
    runtimeProfile: workerEnv.runtimeProfile
  });

  while (true) {
    await loop();
  }
}

main()
  .catch(async (error) => {
    await workerLogger.fatal("Worker fatal error", {
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    });
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
