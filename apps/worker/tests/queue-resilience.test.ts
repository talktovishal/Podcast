import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkText, sha256 } from "@listenlater/core";
import { extractHtmlSnapshot } from "@listenlater/core/src/extract/html";
import { prisma } from "../src/lib/prisma.js";
import { processJob, processNextQueuedJob } from "../src/jobs/processItemJob.js";

let dbReady = false;

function ensureDbBootstrap(): void {
  if (dbReady || process.env.LISTENLATER_TEST_DB_READY === "1") {
    dbReady = true;
    return;
  }

  const here = fileURLToPath(new URL(".", import.meta.url));
  const repoRoot = resolve(here, "../../..");
  const result = spawnSync("npx", ["pnpm", "--filter", "@listenlater/web", "run", "db:bootstrap"], {
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
  const extracted = extractHtmlSnapshot({ html: SNAPSHOT_HTML, url: `https://example.com/${itemId}` });
  const chunks = chunkText(extracted.text);
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

    assert.equal(finishedJob?.status, "SUCCEEDED");
    assert.equal(finishedItem?.status, "READY");
    assert.equal(finishedItem?.sourceHtml, null);
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
