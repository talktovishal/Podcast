import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkText, cleanExtractedMarkdown, markdownToNarrationText, normalizeTtsSelection, sha256 } from "@articlepod/core";
import { backfillCleanedMarkdownArtifacts } from "../src/lib/markdown-artifact-backfill";
import { prisma } from "../src/lib/prisma";
import { getArtifactStorage } from "../src/lib/storage";

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

function computeTextHash(userId: string, markdown: string): string {
  const cleaned = cleanExtractedMarkdown(markdown);
  const narration = markdownToNarrationText(cleaned);
  const chunks = chunkText(narration, Number(process.env.WORKER_TTS_CHUNK_MAX_CHARS ?? 1800));
  const selection = normalizeTtsSelection({
    providerId: "kokoro",
    voice: "af_heart"
  });
  return sha256([userId, selection.providerId, selection.voice, ...chunks.map((chunk) => chunk.hash)].join("|"));
}

test("backfill leaves already-clean markdown artifacts unchanged", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-unchanged`;
  const storage = getArtifactStorage();
  const markdown = `# Clean Story

This markdown is already clean and contains enough prose to remain untouched by the backfill command. It explains a straightforward idea in plain language and keeps its meaning without any navigation or promo noise.

The second paragraph adds more narratable detail so the cleaned narration text comfortably clears the low-signal threshold and should therefore stay ready after the backfill runs.`;

  const user = await prisma.user.create({
    data: {
      email: `backfill-unchanged-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        title: `Unchanged ${uniq}`,
        sourceType: "URL",
        sourceUrl: `https://example.com/unchanged/${uniq}`,
        status: "READY",
        textHash: computeTextHash(user.id, markdown)
      }
    });

    const stored = await storage.putObject(`items/${item.id}/artifacts/source.md`, Buffer.from(markdown, "utf8"), {
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

    const summary = await backfillCleanedMarkdownArtifacts({ itemIds: [item.id] });
    const refreshedItem = await prisma.item.findUnique({ where: { id: item.id } });
    const jobs = await prisma.job.count({ where: { itemId: item.id } });
    const storedMarkdown = (await storage.getObject(stored.key)).toString("utf8");

    assert.equal(summary.scanned, 1);
    assert.equal(summary.unchangedArtifacts, 1);
    assert.equal(summary.updatedArtifacts, 0);
    assert.equal(summary.regenerationQueued, 0);
    assert.equal(refreshedItem?.status, "READY");
    assert.equal(jobs, 0);
    assert.equal(storedMarkdown, markdown);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("backfill queues regeneration when cleaned narration hash changes", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-regen`;
  const storage = getArtifactStorage();
  const markdown = `
[ ![](https://substackcdn.com/image/fetch/hero.jpeg) ](https://substackcdn.com/image/fetch/hero.jpeg)

_December 5th, 2025. (Photo by Jonathan Hoefler)_

The photo above shows the entrance to Unity Temple and introduces the main article body with enough prose for narration.

Another paragraph explains why the building matters, how the author framed the scene, and what the reader should notice next, so the cleaned markdown still contains enough substance to justify regeneration.

[Share](https://example.com/share)
`;

  const user = await prisma.user.create({
    data: {
      email: `backfill-regen-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        title: `Regenerate ${uniq}`,
        sourceType: "URL",
        sourceUrl: `https://example.com/regen/${uniq}`,
        status: "READY",
        textHash: "old-hash"
      }
    });

    const stored = await storage.putObject(`items/${item.id}/artifacts/source.md`, Buffer.from(markdown, "utf8"), {
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
    await prisma.episode.create({
      data: {
        itemId: item.id,
        guid: `episode-${item.id}`,
        title: `Episode ${uniq}`,
        description: "Existing description",
        audioPath: `items/${item.id}/episode.mp3`,
        audioBytes: 1024,
        mimeType: "audio/mpeg",
        publishedAt: new Date()
      }
    });
    await prisma.chunkCache.create({
      data: {
        itemId: item.id,
        chunkIndex: 0,
        hash: "stale-cache",
        filePath: `items/${item.id}/episode.mp3`,
        audioBytes: 1024,
        mimeType: "audio/mpeg"
      }
    });

    const summary = await backfillCleanedMarkdownArtifacts({ itemIds: [item.id] });
    const refreshedItem = await prisma.item.findUnique({ where: { id: item.id } });
    const jobs = await prisma.job.findMany({ where: { itemId: item.id } });
    const chunkCaches = await prisma.chunkCache.count({ where: { itemId: item.id } });
    const storedMarkdown = (await storage.getObject(stored.key)).toString("utf8");
    const episode = await prisma.episode.findUnique({ where: { itemId: item.id } });

    assert.equal(summary.scanned, 1);
    assert.equal(summary.updatedArtifacts, 1);
    assert.equal(summary.regenerationQueued, 1);
    assert.equal(refreshedItem?.status, "QUEUED");
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.status, "QUEUED");
    assert.equal(chunkCaches, 0);
    assert.ok(storedMarkdown.includes("The photo above shows the entrance to Unity Temple"));
    assert.ok(storedMarkdown.includes("Another paragraph explains why the building matters"));
    assert.ok(!storedMarkdown.includes("substackcdn.com"));
    assert.ok(!storedMarkdown.includes("Share"));
    assert.equal(episode?.audioPath, `items/${item.id}/episode.mp3`);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("backfill rewrites legacy raw HTML table artifacts before regeneration", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-legacy-table`;
  const storage = getArtifactStorage();
  const markdown = `
The harness comparison below was captured from an older stored markdown artifact and still contains raw HTML.

<table><tbody><tr><th><strong>Harness</strong></th><th><strong>Duration</strong></th><th><strong>Cost</strong></th></tr><tr><td>Solo</td><td>20 min</td><td>$9</td></tr><tr><td>Full harness</td><td>6 hr</td><td>$200</td></tr></tbody></table>

Agent &amp; Phase summary stays useful for narration after cleanup.
`;

  const user = await prisma.user.create({
    data: {
      email: `backfill-legacy-table-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        title: `Legacy Table ${uniq}`,
        sourceType: "URL",
        sourceUrl: `https://example.com/legacy-table/${uniq}`,
        status: "READY",
        textHash: "old-hash"
      }
    });

    const stored = await storage.putObject(`items/${item.id}/artifacts/source.md`, Buffer.from(markdown, "utf8"), {
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

    const summary = await backfillCleanedMarkdownArtifacts({ itemIds: [item.id] });
    const refreshedItem = await prisma.item.findUnique({ where: { id: item.id } });
    const jobs = await prisma.job.findMany({ where: { itemId: item.id } });
    const storedMarkdown = (await storage.getObject(stored.key)).toString("utf8");
    const narration = markdownToNarrationText(storedMarkdown);

    assert.equal(summary.scanned, 1);
    assert.equal(summary.updatedArtifacts, 1);
    assert.equal(summary.regenerationQueued, 1);
    assert.equal(refreshedItem?.status, "QUEUED");
    assert.equal(jobs.length, 1);
    assert.ok(storedMarkdown.includes("Harness"));
    assert.ok(storedMarkdown.includes("Full harness"));
    assert.ok(storedMarkdown.includes("Agent & Phase summary stays useful for narration after cleanup."));
    assert.ok(!storedMarkdown.includes("<table"));
    assert.ok(!storedMarkdown.includes("<th"));
    assert.ok(!storedMarkdown.includes("&amp;"));
    assert.ok(!narration.includes("tbody"));
    assert.ok(!narration.includes("<table"));
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("backfill reports published low-signal items without deleting live episodes", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-published-low-signal`;
  const storage = getArtifactStorage();
  const markdown = `
[© 2026 Meta](https://www.facebook.com/)

[About](https://www.meta.com/about/)[Developers](https://developers.meta.com/)[Careers](https://www.metacareers.com/)[Privacy](https://www.facebook.com/privacy/)[Cookies](https://www.facebook.com/help/cookies)[Terms](https://www.facebook.com/policies/)[Help Center](https://www.facebook.com/help/)

[English (US)](https://business.facebook.com/)[English (UK)](https://business.facebook.com/)[Español](https://business.facebook.com/)[More languages](#)
`;

  const user = await prisma.user.create({
    data: {
      email: `backfill-low-signal-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        title: `Published Low Signal ${uniq}`,
        sourceType: "URL",
        sourceUrl: `https://example.com/published-low-signal/${uniq}`,
        status: "READY",
        textHash: "old-hash"
      }
    });

    const stored = await storage.putObject(`items/${item.id}/artifacts/source.md`, Buffer.from(markdown, "utf8"), {
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
    await prisma.episode.create({
      data: {
        itemId: item.id,
        guid: `episode-${item.id}`,
        title: `Existing Episode ${uniq}`,
        description: "Existing description",
        audioPath: `items/${item.id}/episode.mp3`,
        audioBytes: 2048,
        mimeType: "audio/mpeg",
        publishedAt: new Date()
      }
    });

    const summary = await backfillCleanedMarkdownArtifacts({ itemIds: [item.id] });
    const refreshedItem = await prisma.item.findUnique({ where: { id: item.id } });
    const jobs = await prisma.job.count({ where: { itemId: item.id } });
    const episode = await prisma.episode.findUnique({ where: { itemId: item.id } });
    const storedMarkdown = (await storage.getObject(stored.key)).toString("utf8");

    assert.equal(summary.scanned, 1);
    assert.equal(summary.skippedPublishedLowSignal, 1);
    assert.equal(summary.regenerationQueued, 0);
    assert.equal(refreshedItem?.status, "READY");
    assert.equal(jobs, 0);
    assert.ok(episode);
    assert.equal(storedMarkdown, "");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
