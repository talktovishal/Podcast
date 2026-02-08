import { workerEnv } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { processNextQueuedJob } from "./jobs/processItemJob.js";

async function loop() {
  const processed = await processNextQueuedJob();
  if (!processed) {
    await new Promise((resolve) => setTimeout(resolve, workerEnv.pollMs));
  }
}

async function main() {
  // eslint-disable-next-line no-console
  console.log(`[worker] starting with poll interval ${workerEnv.pollMs}ms`);

  while (true) {
    await loop();
  }
}

main()
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error("[worker] fatal", error);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
