import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkText, sha256 } from "@articlepod/core";
import { extractHtmlSnapshot } from "@articlepod/core/src/extract/html";
import { prisma } from "../src/lib/prisma.js";
import { workerEnv } from "../src/lib/env.js";
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

async function seedCacheForItem(itemId: string): Promise<string> {
  return seedCacheForHtml(itemId, SNAPSHOT_HTML, `https://example.com/${itemId}`);
}

function markdownToNarrationText(markdown: string, fallbackText: string): string {
  const stripped = markdown
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+[.)]\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return stripped.length >= 120 ? stripped : fallbackText.trim();
}

async function seedCacheForHtml(itemId: string, html: string, url: string): Promise<string> {
  const extracted = extractHtmlSnapshot({ html, url });
  const narrationText = markdownToNarrationText(extracted.markdown, extracted.text);
  const chunks = chunkText(narrationText, workerEnv.ttsChunkMaxChars);
  const cacheKey = sha256(["kokoro", "af_heart", ...chunks.map((chunk) => chunk.hash)].join("|"));

  await prisma.chunkCache.create({
    data: {
      itemId,
      chunkIndex: 0,
      hash: cacheKey,
      filePath: `items/test-${itemId}/episode.m4a`,
      audioBytes: 1024,
      mimeType: "audio/mp4"
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

  await seedCacheForItem(item.id);

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

  await seedCacheForItem(item.id);

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

  await seedCacheForHtml(item.id, oversizedHtml, `https://example.com/oversized/${uniq}`);

  try {
    const processed = await processJob(job.id);
    assert.equal(processed, true);

    const finishedJob = await prisma.job.findUnique({ where: { id: job.id } });
    const finishedItem = await prisma.item.findUnique({ where: { id: item.id } });
    const episode = await prisma.episode.findUnique({ where: { itemId: item.id } });

    assert.equal(finishedJob?.status, "SUCCEEDED");
    assert.equal(finishedItem?.status, "READY");
    assert.ok(episode?.audioPath);
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
