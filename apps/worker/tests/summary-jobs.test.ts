import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/lib/prisma.js";
import { getArtifactStorage } from "../src/lib/storage.js";
import { processSummaryRun } from "../src/jobs/processSummaryRunJob.js";

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
    const markdownKey = `items/${item.id}/artifacts/source.md`;
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
    assert.ok(refreshed?.summaryStorageKey);
    assert.ok(refreshed?.summaryBytes && refreshed.summaryBytes > 0);
    assert.equal(refreshed?.summaryProvider, "stub");
    assert.equal(refreshed?.summaryModel, "stub-deterministic-v1");
    assert.equal(refreshed?.fallbackUsed, false);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
