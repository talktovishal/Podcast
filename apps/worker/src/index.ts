import { createServer } from "node:http";
import { workerEnv } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { processNextQueuedJob } from "./jobs/processItemJob.js";
import { processNextQueuedDigestRun } from "./jobs/processDigestRunJob.js";
import { hasPendingDigestSchedulerTick, scheduleDigestRuns } from "./jobs/scheduleDigestRuns.js";
import { workerLogger } from "./lib/logger.js";
import { describeTtsRuntime } from "./lib/providers.js";
import { evaluateOverflowPolicy, createInitialOverflowPolicyState, type OverflowPolicyConfig } from "./lib/overflowPolicy.js";
import { loadQueuePressureSnapshot, type QueuePressureSnapshot } from "./jobs/queuePressure.js";

const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT ?? 3001);
const MAX_BACKOFF_MS = 30_000;
const OVERFLOW_POLICY_LOG_INTERVAL_MS = 60_000;
let lastPollAt = 0;
let consecutiveIdle = 0;
let lastDigestSchedulerTickAt = 0;
let lastOverflowPolicyEvalAt = 0;
let lastOverflowPolicyLogAt = 0;
let overflowPolicyState = createInitialOverflowPolicyState(new Date());
let lastQueueSnapshot: QueuePressureSnapshot | null = null;

function overflowPolicyConfig(): OverflowPolicyConfig {
  return {
    activateQueueDepth: workerEnv.overflowActivateQueueDepth,
    deactivateQueueDepth: workerEnv.overflowDeactivateQueueDepth,
    activateOldestMs: workerEnv.overflowActivateOldestMs,
    deactivateOldestMs: workerEnv.overflowDeactivateOldestMs,
    minActiveMs: workerEnv.overflowMinActiveMs
  };
}

function digestProcessingEnabled(): boolean {
  return workerEnv.workerRole === "primary";
}

function serializeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function backoffOnIdle(): Promise<void> {
  consecutiveIdle++;
  const backoffMs = Math.min(workerEnv.pollMs * Math.pow(2, consecutiveIdle - 1), MAX_BACKOFF_MS);
  await sleep(backoffMs);
}

async function shouldOverflowWorkerProcessItems(nowMs: number): Promise<boolean> {
  if (workerEnv.workerRole !== "overflow") {
    return true;
  }

  if (!workerEnv.overflowEnabled) {
    return false;
  }

  if (nowMs - lastOverflowPolicyEvalAt < workerEnv.overflowPolicyEvalMs) {
    return overflowPolicyState.active;
  }

  const now = new Date(nowMs);
  const snapshot = await loadQueuePressureSnapshot(now);
  lastQueueSnapshot = snapshot;
  lastOverflowPolicyEvalAt = nowMs;

  const decision = evaluateOverflowPolicy({
    config: overflowPolicyConfig(),
    snapshot: {
      eligibleJobs: snapshot.eligibleJobs,
      oldestEligibleJobAgeMs: snapshot.oldestEligibleJobAgeMs
    },
    previous: overflowPolicyState,
    now
  });
  overflowPolicyState = decision.state;

  const shouldLog = decision.changed || nowMs - lastOverflowPolicyLogAt >= OVERFLOW_POLICY_LOG_INTERVAL_MS;
  if (shouldLog) {
    await workerLogger.info("Overflow queue policy evaluated", {
      changed: decision.changed,
      active: overflowPolicyState.active,
      reason: overflowPolicyState.reason,
      eligibleJobs: snapshot.eligibleJobs,
      queuedJobs: snapshot.queuedJobs,
      retryableFailedJobs: snapshot.retryableFailedJobs,
      processingJobs: snapshot.processingJobs,
      oldestEligibleJobAgeMs: snapshot.oldestEligibleJobAgeMs,
      activateTriggered: decision.activateTriggered,
      deactivateTriggered: decision.deactivateTriggered,
      activeDurationMs: decision.activeDurationMs
    });
    lastOverflowPolicyLogAt = nowMs;
  }

  return overflowPolicyState.active;
}

function startHealthServer(): void {
  const server = createServer(async (req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      const staleMs = workerEnv.staleProcessingMs;
      const staleBefore = new Date(Date.now() - staleMs);
      const stuckJobs = await prisma.job.count({
        where: { status: "PROCESSING", lockedAt: { lt: staleBefore } }
      }).catch(() => -1);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          uptime: process.uptime(),
          lastPollAt,
          stuckJobs,
          workerRole: workerEnv.workerRole,
          overflowActive: workerEnv.workerRole === "overflow" ? overflowPolicyState.active : null,
          queueEligibleJobs: lastQueueSnapshot?.eligibleJobs ?? null
        })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(HEALTH_PORT, "0.0.0.0");
}

async function loop() {
  const nowMs = Date.now();
  lastPollAt = nowMs;

  if (workerEnv.workerRole === "overflow") {
    try {
      const overflowActive = await shouldOverflowWorkerProcessItems(nowMs);
      if (!overflowActive) {
        await backoffOnIdle();
        return;
      }
    } catch (error) {
      await workerLogger.error("Overflow queue policy check failed", {
        error: serializeError(error)
      });
      await backoffOnIdle();
      return;
    }
  }

  const processedItem = await processNextQueuedJob();
  if (processedItem) {
    consecutiveIdle = 0;
    return;
  }

  if (!digestProcessingEnabled()) {
    await backoffOnIdle();
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
    await backoffOnIdle();
  } else {
    consecutiveIdle = 0;
  }
}

async function main() {
  startHealthServer();
  const ttsRuntime = describeTtsRuntime();
  await workerLogger.info("Worker starting", {
    pollMs: workerEnv.pollMs,
    retryPollMs: workerEnv.retryPollMs,
    digestInternalSchedulerEnabled: workerEnv.digestInternalSchedulerEnabled && digestProcessingEnabled(),
    digestSchedulerTickMs: workerEnv.digestSchedulerTickMs,
    runtimeProfile: workerEnv.runtimeProfile,
    workerRole: workerEnv.workerRole,
    overflowEnabled: workerEnv.overflowEnabled,
    overflowPolicyEvalMs: workerEnv.overflowPolicyEvalMs,
    overflowActivateQueueDepth: workerEnv.overflowActivateQueueDepth,
    overflowDeactivateQueueDepth: workerEnv.overflowDeactivateQueueDepth,
    overflowActivateOldestMs: workerEnv.overflowActivateOldestMs,
    overflowDeactivateOldestMs: workerEnv.overflowDeactivateOldestMs,
    overflowMinActiveMs: workerEnv.overflowMinActiveMs,
    ttsLane: ttsRuntime.lane,
    ttsEndpoint: ttsRuntime.pythonTtsUrl
  });

  // Warn operators if digest providers are stubs (silent no-ops in production).
  if (digestProcessingEnabled() && workerEnv.digestSummaryProvider === "stub") {
    await workerLogger.warn(
      "Digest summary provider is 'stub': digests use placeholder summaries. Set DIGEST_SUMMARY_PROVIDER to enable real AI summaries."
    );
  }
  if (digestProcessingEnabled() && workerEnv.digestEmailProvider === "stub") {
    await workerLogger.warn(
      "Digest email provider is 'stub': digest emails will NOT be delivered. Set DIGEST_EMAIL_PROVIDER to enable email delivery."
    );
  }
  if (workerEnv.workerRole === "overflow" && !workerEnv.overflowEnabled) {
    await workerLogger.warn("Overflow worker started with overflow policy disabled; item processing is paused.");
  }
  if (workerEnv.workerRole === "overflow" && !workerEnv.overflowPythonTtsUrl) {
    await workerLogger.warn(
      "Overflow worker is using local python-tts endpoint because OVERFLOW_PYTHON_TTS_URL is not set."
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
