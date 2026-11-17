import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUserDigestSummaryStorageKey, buildUserItemMarkdownStorageKey, buildUserItemSummaryStorageKey } from "@articlepod/core";
import { prisma } from "../src/lib/prisma.js";
import { workerEnv } from "../src/lib/env.js";
import { getArtifactStorage } from "../src/lib/storage.js";
import { resetSummaryProviderForTests } from "../src/lib/summary.js";
import { processDigestRun } from "../src/jobs/processDigestRunJob.js";
import { scheduleDigestRuns } from "../src/jobs/scheduleDigestRuns.js";

let dbReady = false;

function ensureDbBootstrap(): void {
  if (dbReady || process.env.ARTICLEPOD_TEST_DB_READY === "1") {
    dbReady = true;
    return;
  }

  const here = fileURLToPath(new URL(".", import.meta.url));
  const repoRoot = resolve(here, "../../..");
  const result = spawnSync("npx", ["pnpm", "--filter", "@articlepod/web", "run", "db:bootstrap"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "db bootstrap failed");
  }

  dbReady = true;
}

test("scheduleDigestRuns enqueues at most one daily run for old overdue settings", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const now = new Date();

  const user = await prisma.user.create({
    data: {
      email: `digest-scheduler-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    await prisma.userDigestSettings.create({
      data: {
        userId: user.id,
        timezone: "UTC",
        dailyEmailEnabled: true,
        dailyPodcastEnabled: false,
        dailyHour: 16,
        dailyMinute: 0,
        dailyLengthMinutes: 5,
        dailyNextRunAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        weeklyEmailEnabled: false,
        weeklyPodcastEnabled: false,
        weeklyDayOfWeek: 5,
        weeklyHour: 16,
        weeklyMinute: 0,
        weeklyLengthMinutes: 15,
        weeklyNextRunAt: null
      }
    });

    const first = await scheduleDigestRuns(false);
    const second = await scheduleDigestRuns(false);
    assert.equal(first.scheduledRuns >= 1, true);
    assert.equal(second.scheduledRuns, 0);

    const runs = await prisma.digestRun.findMany({
      where: {
        userId: user.id,
        cadence: "DAILY"
      }
    });
    assert.equal(runs.length, 1);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("processDigestRun marks run as SKIPPED when no source markdown exists", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const user = await prisma.user.create({
    data: {
      email: `digest-skip-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  const run = await prisma.digestRun.create({
    data: {
      userId: user.id,
      cadence: "DAILY",
      periodKey: `skip-${uniq}`,
      windowStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
      windowEnd: new Date(),
      scheduledFor: new Date(),
      status: "QUEUED",
      targetLengthMinutes: 5,
      emailEnabled: true,
      podcastEnabled: true
    }
  });

  try {
    const processed = await processDigestRun(run.id);
    assert.equal(processed, true);

    const refreshed = await prisma.digestRun.findUnique({ where: { id: run.id } });
    assert.equal(refreshed?.status, "SKIPPED");
    assert.equal(refreshed?.emailStatus, "SKIPPED");
    assert.equal(refreshed?.podcastStatus, "SKIPPED");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("processDigestRun succeeds with markdown sources and stores summary + stub email", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `digest-success-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        sourceType: "URL",
        sourceUrl: `https://example.com/${uniq}`,
        status: "READY"
      }
    });
    const markdownKey = buildUserItemMarkdownStorageKey(user.id, item.id);
    const markdown = `# Summary ${uniq}\n\nThis is deterministic markdown content for digest tests.`;
    const stored = await storage.putObject(markdownKey, Buffer.from(markdown, "utf8"), {
      contentType: "text/markdown; charset=utf-8"
    });
    await prisma.itemArtifact.create({
      data: {
        itemId: item.id,
        kind: "MARKDOWN",
        storageKey: stored.key,
        contentType: "text/markdown; charset=utf-8",
        byteLength: stored.bytes
      }
    });

    const run = await prisma.digestRun.create({
      data: {
        userId: user.id,
        cadence: "DAILY",
        periodKey: `success-${uniq}`,
        windowStart: new Date(Date.now() - 60 * 60 * 1000),
        windowEnd: new Date(Date.now() + 60 * 1000),
        scheduledFor: new Date(),
        status: "QUEUED",
        targetLengthMinutes: 5,
        emailEnabled: true,
        podcastEnabled: false
      }
    });

    const processed = await processDigestRun(run.id);
    assert.equal(processed, true);

    const refreshed = await prisma.digestRun.findUnique({ where: { id: run.id } });
    assert.equal(refreshed?.status, "SUCCEEDED");
    assert.equal(refreshed?.sourceItemCount, 1);
    assert.equal(refreshed?.emailStatus, "STUB_STORED");
    assert.equal(refreshed?.summaryStorageKey, buildUserDigestSummaryStorageKey(user.id, "DAILY", `success-${uniq}`));
    assert.ok(refreshed?.summaryBytes && refreshed.summaryBytes > 0);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("processDigestRun prefers item summaries before falling back to canonical markdown", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-summary-source`;
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `digest-summary-source-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        title: `Digest source ${uniq}`,
        sourceType: "URL",
        sourceUrl: `https://example.com/${uniq}`,
        status: "READY",
        summaryStatus: "SUCCEEDED",
        summaryStorageKey: buildUserItemSummaryStorageKey(user.id, `pending-${uniq}`)
      }
    });
    const markdownKey = buildUserItemMarkdownStorageKey(user.id, item.id);
    const summaryKey = buildUserItemSummaryStorageKey(user.id, item.id);
    const [storedMarkdown, storedSummary] = await Promise.all([
      storage.putObject(markdownKey, Buffer.from(`# Canonical ${uniq}\n\nFULL_ARTICLE_MARKER`, "utf8"), {
        contentType: "text/markdown; charset=utf-8"
      }),
      storage.putObject(summaryKey, Buffer.from(`# Item summary ${uniq}\n\nSUMMARY_MARKER`, "utf8"), {
        contentType: "text/markdown; charset=utf-8"
      })
    ]);
    await Promise.all([
      prisma.item.update({
        where: { id: item.id },
        data: {
          summaryStorageKey: storedSummary.key,
          summaryBytes: storedSummary.bytes
        }
      }),
      prisma.itemArtifact.create({
        data: {
          itemId: item.id,
          kind: "MARKDOWN",
          storageKey: storedMarkdown.key,
          contentType: "text/markdown; charset=utf-8",
          byteLength: storedMarkdown.bytes
        }
      })
    ]);

    const run = await prisma.digestRun.create({
      data: {
        userId: user.id,
        cadence: "DAILY",
        periodKey: `summary-source-${uniq}`,
        windowStart: new Date(Date.now() - 60 * 60 * 1000),
        windowEnd: new Date(Date.now() + 60 * 1000),
        scheduledFor: new Date(),
        status: "QUEUED",
        targetLengthMinutes: 5,
        emailEnabled: false,
        podcastEnabled: false
      }
    });

    const processed = await processDigestRun(run.id);
    assert.equal(processed, true);

    const refreshed = await prisma.digestRun.findUnique({ where: { id: run.id } });
    assert.ok(refreshed?.summaryStorageKey);
    const digestMarkdown = (await storage.getObject(refreshed.summaryStorageKey)).toString("utf8");
    assert.match(digestMarkdown, /SUMMARY_MARKER/);
    assert.doesNotMatch(digestMarkdown, /FULL_ARTICLE_MARKER/);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("processDigestRun marks FAILED and schedules retry when summary provider fails", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const storage = getArtifactStorage();

  const previousProvider = workerEnv.digestSummaryProvider;
  const previousProxyUrl = workerEnv.digestSummaryProxyUrl;
  workerEnv.digestSummaryProvider = "proxy";
  workerEnv.digestSummaryProxyUrl = "http://127.0.0.1:1";
  resetSummaryProviderForTests();

  const user = await prisma.user.create({
    data: {
      email: `digest-fail-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        sourceType: "PDF",
        status: "READY"
      }
    });
    const markdownKey = buildUserItemMarkdownStorageKey(user.id, item.id);
    const stored = await storage.putObject(markdownKey, Buffer.from("# Fail case", "utf8"), {
      contentType: "text/markdown; charset=utf-8"
    });
    await prisma.itemArtifact.create({
      data: {
        itemId: item.id,
        kind: "MARKDOWN",
        storageKey: stored.key,
        contentType: "text/markdown; charset=utf-8",
        byteLength: stored.bytes
      }
    });

    const run = await prisma.digestRun.create({
      data: {
        userId: user.id,
        cadence: "WEEKLY",
        periodKey: `fail-${uniq}`,
        windowStart: new Date(Date.now() - 60 * 60 * 1000),
        windowEnd: new Date(Date.now() + 60 * 1000),
        scheduledFor: new Date(),
        status: "QUEUED",
        targetLengthMinutes: 15,
        emailEnabled: false,
        podcastEnabled: false
      }
    });

    const processed = await processDigestRun(run.id);
    assert.equal(processed, false);

    const refreshed = await prisma.digestRun.findUnique({ where: { id: run.id } });
    assert.equal(refreshed?.status, "FAILED");
    assert.ok(refreshed?.nextRetryAt instanceof Date);
  } finally {
    workerEnv.digestSummaryProvider = previousProvider;
    workerEnv.digestSummaryProxyUrl = previousProxyUrl;
    resetSummaryProviderForTests();
    await prisma.user.delete({ where: { id: user.id } });
  }
});
