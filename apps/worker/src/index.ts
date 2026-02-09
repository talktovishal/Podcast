import { workerEnv } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { processNextQueuedJob } from "./jobs/processItemJob.js";
import { workerLogger } from "./lib/logger.js";

async function loop() {
  const processed = await processNextQueuedJob();
  if (!processed) {
    await new Promise((resolve) => setTimeout(resolve, workerEnv.pollMs));
  }
}

async function main() {
  await workerLogger.info("Worker starting", {
    pollMs: workerEnv.pollMs,
    retryPollMs: workerEnv.retryPollMs,
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
