import { createServer } from "node:http";
import { workerEnv } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { processNextQueuedJob } from "./jobs/processItemJob.js";
import { processNextQueuedDigestRun } from "./jobs/processDigestRunJob.js";
import { hasPendingDigestSchedulerTick, scheduleDigestRuns } from "./jobs/scheduleDigestRuns.js";
import { workerLogger } from "./lib/logger.js";

const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT ?? 3001);
const MAX_BACKOFF_MS = 30_000;
let lastPollAt = 0;
let consecutiveIdle = 0;

function startHealthServer(): void {
  const server = createServer(async (req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      const staleMs = workerEnv.staleProcessingMs;
      const staleBefore = new Date(Date.now() - staleMs);
      const stuckJobs = await prisma.job.count({
        where: { status: "PROCESSING", lockedAt: { lt: staleBefore } }
      }).catch(() => -1);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime(), lastPollAt, stuckJobs }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(HEALTH_PORT, "0.0.0.0");
}

let lastDigestSchedulerTickAt = 0;

async function loop() {
  lastPollAt = Date.now();
  const processedItem = await processNextQueuedJob();
  if (processedItem) {
    consecutiveIdle = 0;
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
    // Exponential backoff on idle polls: doubles each cycle up to MAX_BACKOFF_MS.
    // Resets to 0 the moment any item or digest job is processed.
    consecutiveIdle++;
    const backoffMs = Math.min(workerEnv.pollMs * Math.pow(2, consecutiveIdle - 1), MAX_BACKOFF_MS);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  } else {
    consecutiveIdle = 0;
  }
}

async function main() {
  startHealthServer();
  await workerLogger.info("Worker starting", {
    pollMs: workerEnv.pollMs,
    retryPollMs: workerEnv.retryPollMs,
    digestInternalSchedulerEnabled: workerEnv.digestInternalSchedulerEnabled,
    digestSchedulerTickMs: workerEnv.digestSchedulerTickMs,
    runtimeProfile: workerEnv.runtimeProfile
  });

  // Warn operators if digest providers are stubs (silent no-ops in production).
  if (workerEnv.digestSummaryProvider === "stub") {
    await workerLogger.warn(
      "Digest summary provider is 'stub': digests use placeholder summaries. Set DIGEST_SUMMARY_PROVIDER to enable real AI summaries."
    );
  }
  if (workerEnv.digestEmailProvider === "stub") {
    await workerLogger.warn(
      "Digest email provider is 'stub': digest emails will NOT be delivered. Set DIGEST_EMAIL_PROVIDER to enable email delivery."
    );
  }

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
