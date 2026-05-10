import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUserItemMarkdownStorageKey, buildUserItemSummaryStorageKey, buildUserSummaryRunStorageKey } from "@articlepod/core";
import { workerEnv } from "../src/lib/env.js";
import { prisma } from "../src/lib/prisma.js";
import { resetSummaryProviderForTests } from "../src/lib/summary.js";
import { getArtifactStorage } from "../src/lib/storage.js";
import { processJob } from "../src/jobs/processItemJob.js";
import { processArticleSummaryTask } from "../src/jobs/processArticleSummaryTask.js";
import { processSummaryRun } from "../src/jobs/processSummaryRunJob.js";

let dbReady = false;
const originalFetch = globalThis.fetch;

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

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  workerEnv.digestSummaryProvider = "stub";
  workerEnv.azureOpenAiBaseUrl = undefined;
  workerEnv.azureOpenAiApiKey = undefined;
  workerEnv.azureOpenAiSummaryNanoDeployment = "digest-summary-nano";
  workerEnv.azureOpenAiSummaryMiniDeployment = "digest-summary-mini";
  resetSummaryProviderForTests();
});

test("processSummaryRun succeeds with selected markdown sources and stores summary metadata", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `summary-success-${uniq}@articlepod.local`,
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
    const stored = await storage.putObject(markdownKey, Buffer.from(`# Saved item ${uniq}\n\nFresh summary notes.`, "utf8"), {
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

    const run = await prisma.summaryRun.create({
      data: {
        userId: user.id,
        requestedTitle: "Manual summary",
        windowStart: new Date(Date.now() - 60 * 60 * 1000),
        windowEnd: new Date(Date.now() + 60 * 1000),
        status: "QUEUED",
        targetLengthMinutes: 15,
        selectedItemCount: 1,
        podcastEnabled: false,
        items: {
          create: {
            itemId: item.id,
            orderIndex: 0
          }
        }
      }
    });

    const processed = await processSummaryRun(run.id);
    assert.equal(processed, true);

    const refreshed = await prisma.summaryRun.findUnique({ where: { id: run.id } });
    assert.equal(refreshed?.status, "SUCCEEDED");
    assert.equal(refreshed?.selectedItemCount, 1);
    assert.equal(refreshed?.summaryStorageKey, buildUserSummaryRunStorageKey(user.id, run.id));
    assert.ok(refreshed?.summaryBytes && refreshed.summaryBytes > 0);
    assert.equal(refreshed?.summaryProvider, "stub");
    assert.equal(refreshed?.summaryModel, "stub-deterministic-v1");
    assert.equal(refreshed?.fallbackUsed, false);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("processSummaryRun stores a friendly failure message when the summary provider returns a technical error", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-friendly-error`;
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `summary-friendly-error-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  workerEnv.digestSummaryProvider = "azure_openai";
  workerEnv.azureOpenAiBaseUrl = "https://example.openai.azure.com";
  workerEnv.azureOpenAiApiKey = "test-key";
  resetSummaryProviderForTests();
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: "bad request" } }), {
      status: 400,
      headers: {
        "content-type": "application/json"
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
    const stored = await storage.putObject(markdownKey, Buffer.from(`# Saved item ${uniq}\n\nFresh summary notes.`, "utf8"), {
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

    const run = await prisma.summaryRun.create({
      data: {
        userId: user.id,
        requestedTitle: "Manual summary",
        windowStart: new Date(Date.now() - 60 * 60 * 1000),
        windowEnd: new Date(Date.now() + 60 * 1000),
        status: "QUEUED",
        targetLengthMinutes: 15,
        selectedItemCount: 1,
        podcastEnabled: false,
        items: {
          create: {
            itemId: item.id,
            orderIndex: 0
          }
        }
      }
    });

    const processed = await processSummaryRun(run.id);
    assert.equal(processed, false);

    const refreshed = await prisma.summaryRun.findUnique({
      where: { id: run.id },
      select: {
        status: true,
        errorCode: true,
        errorMessage: true
      }
    });
    assert.equal(refreshed?.status, "FAILED");
    assert.equal(refreshed?.errorCode, "EXTRACTION_FAILED");
    assert.equal(refreshed?.errorMessage, "We couldn't finish this summary right now. Please try again.");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("summary-only item job stores an item summary without creating an episode", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-item-summary`;
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `item-summary-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        title: `Item summary ${uniq}`,
        sourceType: "HTML_SNAPSHOT",
        sourceUrl: `https://example.com/${uniq}`,
        sourceHtml: `<html><body><article><h1>Summary ${uniq}</h1><p>This saved article has enough text to create a deterministic item summary without synthesizing audio.</p><p>It should remain a summary-only item until TTS is explicitly requested.</p></article></body></html>`,
        status: "QUEUED",
        processingMode: "SUMMARY_ONLY",
        summaryStatus: "PROCESSING",
        jobs: {
          create: {
            jobKind: "SUMMARY_ONLY",
            status: "QUEUED",
            scheduledFor: new Date()
          }
        }
      },
      include: {
        jobs: true
      }
    });

    const processed = await processJob(item.jobs[0].id);
    assert.equal(processed, true);

    const refreshed = await prisma.item.findUnique({
      where: { id: item.id },
      include: {
        episode: true
      }
    });
    assert.equal(refreshed?.status, "READY");
    assert.equal(refreshed?.processingMode, "SUMMARY_ONLY");
    assert.equal(refreshed?.summaryStatus, "SUCCEEDED");
    assert.equal(refreshed?.summaryStorageKey, buildUserItemSummaryStorageKey(user.id, item.id));
    assert.equal(refreshed?.episode, null);

    const summaryMarkdown = (await storage.getObject(buildUserItemSummaryStorageKey(user.id, item.id))).toString("utf8");
    assert.match(summaryMarkdown, /## Key points/);
    assert.match(summaryMarkdown, /Item summary/);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("processArticleSummaryTask completes a podcast transcript item without creating audio", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-article-summary-task`;
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `article-summary-task-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        title: `Podcast transcript ${uniq}`,
        sourceType: "PODCAST_TRANSCRIPT",
        sourceUrl: `https://podcasts.apple.com/us/podcast/example/id123?i=${uniq}`,
        status: "QUEUED",
        processingMode: "SUMMARY_ONLY",
        summaryStatus: "PROCESSING"
      }
    });
    const markdownKey = buildUserItemMarkdownStorageKey(user.id, item.id);
    const stored = await storage.putObject(
      markdownKey,
      Buffer.from(
        `# Podcast transcript ${uniq}\n\nThis transcript contains enough useful detail for a summary. The speaker explains the topic, gives examples, and closes with practical implications for listeners.`,
        "utf8"
      ),
      { contentType: "text/markdown; charset=utf-8" }
    );
    await prisma.itemArtifact.create({
      data: {
        itemId: item.id,
        kind: "MARKDOWN",
        storageKey: stored.key,
        contentType: "text/markdown; charset=utf-8",
        byteLength: stored.bytes
      }
    });
    const task = await prisma.articleSummaryTask.create({
      data: {
        itemId: item.id,
        userId: user.id,
        status: "QUEUED",
        scheduledFor: new Date()
      }
    });

    const processed = await processArticleSummaryTask(task.id);
    assert.equal(processed, true);

    const refreshed = await prisma.item.findUnique({
      where: { id: item.id },
      include: { episode: true, jobs: true, articleSummaryTask: true }
    });
    assert.equal(refreshed?.status, "READY");
    assert.equal(refreshed?.summaryStatus, "SUCCEEDED");
    assert.equal(refreshed?.summaryStorageKey, buildUserItemSummaryStorageKey(user.id, item.id));
    assert.equal(refreshed?.episode, null);
    assert.equal(refreshed?.jobs.length, 0);
    assert.equal(refreshed?.articleSummaryTask, null);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("processArticleSummaryTask marks missing markdown failures retryable", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-article-summary-task-failed`;

  const user = await prisma.user.create({
    data: {
      email: `article-summary-task-failed-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        title: `Missing markdown ${uniq}`,
        sourceType: "PODCAST_TRANSCRIPT",
        sourceUrl: `https://podcasts.apple.com/us/podcast/example/id123?i=${uniq}`,
        status: "QUEUED",
        processingMode: "SUMMARY_ONLY",
        summaryStatus: "PROCESSING"
      }
    });
    const task = await prisma.articleSummaryTask.create({
      data: {
        itemId: item.id,
        userId: user.id,
        status: "QUEUED",
        scheduledFor: new Date()
      }
    });

    const processed = await processArticleSummaryTask(task.id);
    assert.equal(processed, false);

    const [refreshedItem, refreshedTask] = await Promise.all([
      prisma.item.findUnique({ where: { id: item.id } }),
      prisma.articleSummaryTask.findUnique({ where: { id: task.id } })
    ]);
    assert.equal(refreshedItem?.status, "FAILED");
    assert.equal(refreshedItem?.summaryStatus, "FAILED");
    assert.equal(refreshedTask?.status, "FAILED");
    assert.equal(refreshedTask?.attempt, 1);
    assert.ok(refreshedTask?.nextRetryAt);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("processArticleSummaryTask does not update item after lease mismatch", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-article-summary-task-lease`;
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `article-summary-task-lease-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  const originalFetch = globalThis.fetch;
  workerEnv.digestSummaryProvider = "azure_openai";
  workerEnv.azureOpenAiBaseUrl = "https://example.openai.azure.com";
  workerEnv.azureOpenAiApiKey = "test-key";
  resetSummaryProviderForTests();

  try {
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        title: `Lease mismatch ${uniq}`,
        sourceType: "PODCAST_TRANSCRIPT",
        sourceUrl: `https://podcasts.apple.com/us/podcast/example/id123?i=${uniq}`,
        status: "QUEUED",
        processingMode: "SUMMARY_ONLY",
        summaryStatus: "PROCESSING"
      }
    });
    const markdownKey = buildUserItemMarkdownStorageKey(user.id, item.id);
    const stored = await storage.putObject(
      markdownKey,
      Buffer.from(
        `# Lease mismatch ${uniq}\n\nThis transcript has enough content to reach the summary provider before the lease is changed underneath the processor.`,
        "utf8"
      ),
      { contentType: "text/markdown; charset=utf-8" }
    );
    await prisma.itemArtifact.create({
      data: {
        itemId: item.id,
        kind: "MARKDOWN",
        storageKey: stored.key,
        contentType: "text/markdown; charset=utf-8",
        byteLength: stored.bytes
      }
    });
    const task = await prisma.articleSummaryTask.create({
      data: {
        itemId: item.id,
        userId: user.id,
        status: "QUEUED",
        scheduledFor: new Date()
      }
    });

    globalThis.fetch = (async () => {
      await prisma.articleSummaryTask.update({
        where: { id: task.id },
        data: { leaseId: "stolen-lease" }
      });
      return new Response(
        JSON.stringify({
          title: "Should not persist",
          markdown: "# Should not persist\n\nA summary that must not update the item.",
          plainText: "Should not persist"
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }) as typeof fetch;

    const processed = await processArticleSummaryTask(task.id);
    assert.equal(processed, false);

    const refreshed = await prisma.item.findUnique({ where: { id: item.id } });
    assert.equal(refreshed?.status, "QUEUED");
    assert.equal(refreshed?.summaryStatus, "PROCESSING");
    assert.equal(refreshed?.summaryStorageKey, null);
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.user.delete({ where: { id: user.id } });
  }
});
