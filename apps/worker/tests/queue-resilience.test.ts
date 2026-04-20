import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkText, cleanExtractedMarkdown, errorCodes, hasNarratableText, markdownToNarrationText, sha256 } from "@articlepod/core";
import { extractHtmlSnapshot } from "@articlepod/core/src/extract/html";
import { prisma } from "../src/lib/prisma.js";
import { workerEnv } from "../src/lib/env.js";
import { getArtifactStorage } from "../src/lib/storage.js";
import { processJob, processNextQueuedJob } from "../src/jobs/processItemJob.js";

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

const SNAPSHOT_HTML = `
<html>
  <head><title>Queue Fixture</title></head>
  <body>
    <article>
      <h1>Queue Fixture</h1>
      <p>This fixture provides enough deterministic text for extraction and chunking in worker queue tests.</p>
      <p>It is used to validate stale lock reclaim and retry scheduling behavior.</p>
      <p>The text is intentionally stable to keep cache key generation deterministic.</p>
    </article>
  </body>
</html>
`;

async function seedCacheForItem(itemId: string, userId: string): Promise<string> {
  return seedCacheForHtml(itemId, userId, SNAPSHOT_HTML, `https://example.com/${itemId}`);
}

async function seedCacheForHtml(itemId: string, userId: string, html: string, url: string): Promise<string> {
  const extracted = extractHtmlSnapshot({ html, url });
  const narrationText = markdownToNarrationText(cleanExtractedMarkdown(extracted.markdown));
  const chunks = chunkText(narrationText, workerEnv.ttsChunkMaxChars);
  const cacheKey = sha256([userId, "kokoro", "af_heart", ...chunks.map((chunk) => chunk.hash)].join("|"));

  await prisma.chunkCache.create({
    data: {
      itemId,
      chunkIndex: 0,
      hash: cacheKey,
      filePath: `items/test-${itemId}/episode.mp3`,
      audioBytes: 1024,
      mimeType: "audio/mpeg"
    }
  });

  return cacheKey;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

test("reclaims stale processing job and completes it", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const user = await prisma.user.create({
    data: {
      email: `stale-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      title: `Stale ${uniq}`,
      sourceType: "HTML_SNAPSHOT",
      sourceUrl: `https://example.com/stale/${uniq}`,
      sourceHtml: SNAPSHOT_HTML,
      sourceCapturedAt: new Date(),
      status: "PROCESSING"
    }
  });

  await seedCacheForItem(item.id, user.id);

  const staleTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const job = await prisma.job.create({
    data: {
      itemId: item.id,
      status: "PROCESSING",
      lockedAt: staleTime,
      attempt: 0
    }
  });

  try {
    const processed = await processNextQueuedJob();
    assert.equal(processed, true);

    const finishedJob = await prisma.job.findUnique({ where: { id: job.id } });
    const finishedItem = await prisma.item.findUnique({ where: { id: item.id } });
    const artifacts = await prisma.itemArtifact.findMany({
      where: { itemId: item.id },
      orderBy: { kind: "asc" }
    });

    assert.equal(finishedJob?.status, "SUCCEEDED");
    assert.equal(finishedItem?.status, "READY");
    assert.equal(finishedItem?.sourceHtml, null);
    assert.ok(artifacts.some((artifact) => artifact.kind === "RAW_HTML"));
    assert.ok(artifacts.some((artifact) => artifact.kind === "MARKDOWN"));
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("does not process failed job before nextRetryAt", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-future`;

  const user = await prisma.user.create({
    data: {
      email: `retry-future-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      title: `Retry Future ${uniq}`,
      sourceType: "HTML_SNAPSHOT",
      sourceUrl: `https://example.com/retry/future/${uniq}`,
      sourceHtml: SNAPSHOT_HTML,
      sourceCapturedAt: new Date(),
      status: "FAILED"
    }
  });

  const job = await prisma.job.create({
    data: {
      itemId: item.id,
      status: "FAILED",
      attempt: 0,
      nextRetryAt: new Date(Date.now() + 10 * 60 * 1000)
    }
  });

  try {
    const processed = await processJob(job.id);
    assert.equal(processed, false);

    const untouched = await prisma.job.findUnique({ where: { id: job.id } });
    assert.equal(untouched?.status, "FAILED");
    assert.equal(untouched?.attempt, 0);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("does not process queued job before scheduledFor", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-queued-future`;

  const user = await prisma.user.create({
    data: {
      email: `queued-future-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      title: `Queued Future ${uniq}`,
      sourceType: "HTML_SNAPSHOT",
      sourceUrl: `https://example.com/queued/future/${uniq}`,
      sourceHtml: SNAPSHOT_HTML,
      sourceCapturedAt: new Date(),
      status: "QUEUED",
      errorCode: "PRO_DAILY_LIMIT_DEFERRED",
      errorMessage: "Accepted. Processing is queued for the next available Pro window."
    }
  });

  const scheduledFor = new Date(Date.now() + 10 * 60 * 1000);
  const job = await prisma.job.create({
    data: {
      itemId: item.id,
      status: "QUEUED",
      scheduledFor,
      nextRetryAt: scheduledFor,
      errorCode: "PRO_DAILY_LIMIT_DEFERRED",
      errorMessage: "Accepted. Processing is queued for the next available Pro window."
    }
  });

  try {
    const processed = await processJob(job.id);
    assert.equal(processed, false);

    const untouched = await prisma.job.findUnique({ where: { id: job.id } });
    assert.equal(untouched?.status, "QUEUED");
    assert.equal(untouched?.attempt, 0);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("stale processing retry does not block newer queued work", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-stale-priority`;
  const previousMaxStaleRetries = workerEnv.maxStaleRetries;
  workerEnv.maxStaleRetries = 1;
  const queuedHtml = SNAPSHOT_HTML.replaceAll("Queue Fixture", `Queue Fixture ${uniq} queued`);

  const user = await prisma.user.create({
    data: {
      email: `stale-priority-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });
  const queuedUser = await prisma.user.create({
    data: {
      email: `queued-priority-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  const staleItem = await prisma.item.create({
    data: {
      userId: user.id,
      title: `Stale Priority ${uniq}`,
      sourceType: "HTML_SNAPSHOT",
      sourceUrl: `https://example.com/stale-priority/${uniq}`,
      sourceHtml: SNAPSHOT_HTML,
      sourceCapturedAt: new Date(),
      status: "PROCESSING"
    }
  });

  const queuedItem = await prisma.item.create({
    data: {
      userId: queuedUser.id,
      title: `Queued Priority ${uniq}`,
      sourceType: "HTML_SNAPSHOT",
      sourceUrl: `https://example.com/queued-priority/${uniq}`,
      sourceHtml: queuedHtml,
      sourceCapturedAt: new Date(),
      status: "QUEUED"
    }
  });

  await seedCacheForItem(staleItem.id, user.id);
  await seedCacheForHtml(queuedItem.id, queuedUser.id, queuedHtml, `https://example.com/queued-priority/${uniq}`);

  const staleJob = await prisma.job.create({
    data: {
      itemId: staleItem.id,
      status: "PROCESSING",
      lockedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      attempt: 1
    }
  });

  const queuedJob = await prisma.job.create({
    data: {
      itemId: queuedItem.id,
      status: "QUEUED",
      attempt: 0
    }
  });

  try {
    const processed = await processNextQueuedJob();
    assert.equal(processed, true);

    const [staleJobAfter, staleItemAfter, queuedJobAfter, queuedItemAfter] = await Promise.all([
      prisma.job.findUnique({ where: { id: staleJob.id } }),
      prisma.item.findUnique({ where: { id: staleItem.id } }),
      prisma.job.findUnique({ where: { id: queuedJob.id } }),
      prisma.item.findUnique({ where: { id: queuedItem.id } })
    ]);

    assert.equal(staleJobAfter?.status, "FAILED");
    assert.ok(staleJobAfter?.nextRetryAt);
    assert.equal(staleJobAfter?.errorCode, null);
    assert.equal(staleItemAfter?.status, "QUEUED");
    assert.match(staleItemAfter?.errorMessage ?? "", /Retrying after/);

    assert.equal(queuedJobAfter?.status, "SUCCEEDED");
    assert.equal(queuedItemAfter?.status, "READY");
  } finally {
    workerEnv.maxStaleRetries = previousMaxStaleRetries;
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [user.id, queuedUser.id]
        }
      }
    });
  }
});

test("marks repeatedly stale processing job failed instead of retrying forever", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-stale-terminal`;
  const previousMaxStaleRetries = workerEnv.maxStaleRetries;
  workerEnv.maxStaleRetries = 1;

  const user = await prisma.user.create({
    data: {
      email: `stale-terminal-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      title: `Stale Terminal ${uniq}`,
      sourceType: "HTML_SNAPSHOT",
      sourceUrl: `https://example.com/stale-terminal/${uniq}`,
      sourceHtml: SNAPSHOT_HTML,
      sourceCapturedAt: new Date(),
      status: "PROCESSING"
    }
  });

  const job = await prisma.job.create({
    data: {
      itemId: item.id,
      status: "PROCESSING",
      lockedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      attempt: 2
    }
  });

  try {
    const processed = await processNextQueuedJob();
    assert.equal(processed, false);

    const finishedJob = await prisma.job.findUnique({ where: { id: job.id } });
    const finishedItem = await prisma.item.findUnique({ where: { id: item.id } });

    assert.equal(finishedJob?.status, "FAILED");
    assert.equal(finishedJob?.nextRetryAt, null);
    assert.equal(finishedJob?.errorCode, errorCodes.PROCESSING_TIMEOUT);
    assert.match(finishedJob?.errorMessage ?? "", /stalled/i);
    assert.equal(finishedItem?.status, "FAILED");
    assert.equal(finishedItem?.errorCode, errorCodes.PROCESSING_TIMEOUT);
  } finally {
    workerEnv.maxStaleRetries = previousMaxStaleRetries;
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("processes retry-eligible failed job when nextRetryAt is due", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-due`;

  const user = await prisma.user.create({
    data: {
      email: `retry-due-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      title: `Retry Due ${uniq}`,
      sourceType: "HTML_SNAPSHOT",
      sourceUrl: `https://example.com/retry/due/${uniq}`,
      sourceHtml: SNAPSHOT_HTML,
      sourceCapturedAt: new Date(),
      status: "FAILED"
    }
  });

  await seedCacheForItem(item.id, user.id);

  const job = await prisma.job.create({
    data: {
      itemId: item.id,
      status: "FAILED",
      attempt: 0,
      nextRetryAt: new Date(Date.now() - 60 * 1000)
    }
  });

  try {
    const processed = await processJob(job.id);
    assert.equal(processed, true);

    const finishedJob = await prisma.job.findUnique({ where: { id: job.id } });
    const finishedItem = await prisma.item.findUnique({ where: { id: item.id } });

    assert.equal(finishedJob?.status, "SUCCEEDED");
    assert.ok((finishedJob?.attempt ?? 0) >= 1);
    assert.equal(finishedItem?.status, "READY");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("processes oversized snapshot when chunk cache is available", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-oversize`;

  const user = await prisma.user.create({
    data: {
      email: `oversize-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  const repeated = "Long-form paragraph. ".repeat(3000);
  const oversizedHtml = `<html><body><article><h1>Oversized</h1><p>${repeated}</p></article></body></html>`;

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      title: `Oversized ${uniq}`,
      sourceType: "HTML_SNAPSHOT",
      sourceUrl: `https://example.com/oversized/${uniq}`,
      sourceHtml: oversizedHtml,
      sourceCapturedAt: new Date(),
      status: "QUEUED"
    }
  });

  const job = await prisma.job.create({
    data: {
      itemId: item.id,
      status: "QUEUED",
      attempt: 0
    }
  });

  await seedCacheForHtml(item.id, user.id, oversizedHtml, `https://example.com/oversized/${uniq}`);

  try {
    const processed = await processJob(job.id);
    assert.equal(processed, true);

    const finishedJob = await prisma.job.findUnique({ where: { id: job.id } });
    const finishedItem = await prisma.item.findUnique({ where: { id: item.id } });
    const episode = await prisma.episode.findUnique({ where: { itemId: item.id } });

    assert.equal(finishedJob?.status, "SUCCEEDED");
    assert.equal(finishedItem?.status, "READY");
    assert.ok(episode?.audioPath);
    assert.equal(episode?.audioPath.endsWith(".mp3"), true);
    assert.equal(episode?.mimeType, "audio/mpeg");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("fails oversized snapshot before synthesis when chunk cache is unavailable", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-oversize-no-cache`;

  const user = await prisma.user.create({
    data: {
      email: `oversize-no-cache-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  const repeated = "Long-form paragraph. ".repeat(3000);
  const oversizedHtml = `<html><body><article><h1>Oversized</h1><p>${repeated}</p></article></body></html>`;

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      title: `Oversized No Cache ${uniq}`,
      sourceType: "HTML_SNAPSHOT",
      sourceUrl: `https://example.com/oversized-no-cache/${uniq}`,
      sourceHtml: oversizedHtml,
      sourceCapturedAt: new Date(),
      status: "QUEUED"
    }
  });

  const job = await prisma.job.create({
    data: {
      itemId: item.id,
      status: "QUEUED",
      attempt: 0
    }
  });

  try {
    const processed = await processJob(job.id);
    assert.equal(processed, false);

    const finishedJob = await prisma.job.findUnique({ where: { id: job.id } });
    const finishedItem = await prisma.item.findUnique({ where: { id: item.id } });
    const episode = await prisma.episode.findUnique({ where: { itemId: item.id } });

    assert.equal(finishedJob?.status, "FAILED");
    assert.equal(finishedJob?.errorCode, errorCodes.SOURCE_TOO_LONG);
    assert.equal(finishedItem?.status, "FAILED");
    assert.equal(finishedItem?.errorCode, errorCodes.SOURCE_TOO_LONG);
    assert.match(finishedItem?.errorMessage ?? "", /too long to narrate/);
    assert.equal(episode, null);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("does not crash when item is deleted while a job is processing", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-deleted-mid-flight`;

  const user = await prisma.user.create({
    data: {
      email: `deleted-mid-flight-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  const longHtml = `<html><body><article><h1>Delete Mid Flight</h1><p>${"Queue resilience text. ".repeat(18_000)}</p></article></body></html>`;

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      title: `Delete Mid Flight ${uniq}`,
      sourceType: "HTML_SNAPSHOT",
      sourceUrl: `https://example.com/delete-mid-flight/${uniq}`,
      sourceHtml: longHtml,
      sourceCapturedAt: new Date(),
      status: "QUEUED"
    }
  });

  const job = await prisma.job.create({
    data: {
      itemId: item.id,
      status: "QUEUED",
      attempt: 0
    }
  });

  try {
    const processingPromise = processJob(job.id);

    let claimed = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const current = await prisma.job.findUnique({
        where: { id: job.id },
        select: { status: true }
      });
      if (current?.status === "PROCESSING") {
        claimed = true;
        break;
      }
      await sleep(20);
    }

    assert.equal(claimed, true);

    await prisma.item.delete({ where: { id: item.id } });

    const processed = await processingPromise;
    assert.equal(processed, false);

    const remainingItem = await prisma.item.findUnique({ where: { id: item.id } });
    const remainingJob = await prisma.job.findUnique({ where: { id: job.id } });
    assert.equal(remainingItem, null);
    assert.equal(remainingJob, null);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("does not auto-retry non-retryable failed job", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-no-retry`;

  const user = await prisma.user.create({
    data: {
      email: `no-retry-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      title: `No Retry ${uniq}`,
      sourceType: "HTML_SNAPSHOT",
      sourceUrl: `https://example.com/no-retry/${uniq}`,
      sourceHtml: SNAPSHOT_HTML,
      sourceCapturedAt: new Date(),
      status: "FAILED",
      errorCode: "INVALID_INPUT",
      errorMessage: "Input invalid."
    }
  });

  const job = await prisma.job.create({
    data: {
      itemId: item.id,
      status: "FAILED",
      attempt: 1,
      errorCode: "INVALID_INPUT",
      errorMessage: "Input invalid.",
      nextRetryAt: null
    }
  });

  try {
    const processed = await processNextQueuedJob();
    assert.equal(processed, false);

    const unchanged = await prisma.job.findUnique({ where: { id: job.id } });
    assert.equal(unchanged?.status, "FAILED");
    assert.equal(unchanged?.attempt, 1);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("does not process failed job that exceeded max retry attempts", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-max-attempts`;

  const user = await prisma.user.create({
    data: {
      email: `max-attempts-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      title: `Max Attempts ${uniq}`,
      sourceType: "HTML_SNAPSHOT",
      sourceUrl: `https://example.com/max-attempts/${uniq}`,
      sourceHtml: SNAPSHOT_HTML,
      sourceCapturedAt: new Date(),
      status: "FAILED",
      errorCode: "TTS_FAILED",
      errorMessage: "Audio generation failed."
    }
  });

  const job = await prisma.job.create({
    data: {
      itemId: item.id,
      status: "FAILED",
      attempt: 99,
      errorCode: "TTS_FAILED",
      errorMessage: "Audio generation failed.",
      nextRetryAt: new Date(Date.now() - 60_000)
    }
  });

  try {
    const processed = await processJob(job.id);
    assert.equal(processed, false);

    const unchanged = await prisma.job.findUnique({ where: { id: job.id } });
    assert.equal(unchanged?.status, "FAILED");
    assert.equal(unchanged?.attempt, 99);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("processing stores cleaned markdown artifacts and hashes cleaned narration text", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-cleaned`;
  const html = `
    <html>
      <head><title>Cleaned Worker Fixture</title></head>
      <body>
        <article>
          <h1>Cleaned Worker Fixture</h1>
          <p>Written by Example Reporter</p>
          <figure>
            <img alt="Header image" src="https://example.com/header.jpg" />
            <figcaption>Getty Images</figcaption>
          </figure>
          <p>This article includes enough stable prose to exercise the cleaned markdown persistence path inside the worker.</p>
          <p>Another paragraph adds more detail so the narration hash stays deterministic for this regression test.</p>
          <p>Read more</p>
        </article>
      </body>
    </html>
  `;

  const user = await prisma.user.create({
    data: {
      email: `cleaned-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      title: `Cleaned ${uniq}`,
      sourceType: "HTML_SNAPSHOT",
      sourceUrl: `https://example.com/cleaned/${uniq}`,
      sourceHtml: html,
      sourceCapturedAt: new Date(),
      status: "QUEUED"
    }
  });

  await prisma.job.create({
    data: {
      itemId: item.id,
      status: "QUEUED"
    }
  });

  const expectedCacheKey = await seedCacheForHtml(item.id, user.id, html, `https://example.com/cleaned/${uniq}`);

  try {
    const processed = await processNextQueuedJob();
    assert.equal(processed, true);

    const refreshedItem = await prisma.item.findUnique({ where: { id: item.id } });
    const markdownArtifact = await prisma.itemArtifact.findUnique({
      where: {
        itemId_kind: {
          itemId: item.id,
          kind: "MARKDOWN"
        }
      }
    });
    assert.ok(markdownArtifact);
    const storedMarkdown = (await getArtifactStorage().getObject(markdownArtifact!.storageKey)).toString("utf8");
    const narration = markdownToNarrationText(storedMarkdown);

    assert.equal(refreshedItem?.status, "READY");
    assert.equal(refreshedItem?.textHash, expectedCacheKey);
    assert.equal(hasNarratableText(narration), true);
    assert.ok(storedMarkdown.includes("This article includes enough stable prose"));
    assert.ok(storedMarkdown.includes("Written by Example Reporter"));
    assert.ok(storedMarkdown.includes("Getty Images"));
    assert.ok(!storedMarkdown.includes("Read more"));
    assert.ok(!narration.includes("Written by Example Reporter"));
    assert.ok(!narration.includes("Getty Images"));
    assert.ok(!narration.includes("Read more"));
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("processing fails low-signal chrome-only markdown after cleanup", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-low-signal`;
  const html = `
    <html>
      <head><title>Footer Only</title></head>
      <body>
        <article>
          <p><a href="https://www.facebook.com/">© 2026 Meta</a></p>
          <p>
            <a href="https://www.meta.com/about/">About</a>
            <a href="https://developers.meta.com/">Developers</a>
            <a href="https://www.metacareers.com/">Careers</a>
            <a href="https://www.facebook.com/privacy/">Privacy</a>
            <a href="https://www.facebook.com/help/cookies">Cookies</a>
            <a href="https://www.facebook.com/policies/">Terms</a>
            <a href="https://www.facebook.com/help/">Help Center</a>
          </p>
          <p>
            <a href="https://business.facebook.com/">English (US)</a>
            <a href="https://business.facebook.com/">English (UK)</a>
            <a href="https://business.facebook.com/">Espanol</a>
            <a href="#">More languages</a>
          </p>
        </article>
      </body>
    </html>
  `;

  const user = await prisma.user.create({
    data: {
      email: `low-signal-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      title: `Low Signal ${uniq}`,
      sourceType: "HTML_SNAPSHOT",
      sourceUrl: `https://example.com/low-signal/${uniq}`,
      sourceHtml: html,
      sourceCapturedAt: new Date(),
      status: "QUEUED"
    }
  });

  const job = await prisma.job.create({
    data: {
      itemId: item.id,
      status: "QUEUED"
    }
  });

  try {
    const processed = await processJob(job.id);
    assert.equal(processed, false);

    const refreshedItem = await prisma.item.findUnique({ where: { id: item.id } });
    const refreshedJob = await prisma.job.findUnique({ where: { id: job.id } });

    assert.equal(refreshedItem?.status, "FAILED");
    assert.equal(refreshedItem?.errorCode, errorCodes.EXTRACTION_EMPTY);
    assert.match(refreshedItem?.errorMessage || "", /after removing navigation, login, and promo content/i);
    assert.equal(refreshedJob?.status, "FAILED");
    assert.equal(refreshedJob?.errorCode, errorCodes.EXTRACTION_EMPTY);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
