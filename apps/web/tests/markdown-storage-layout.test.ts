import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildLegacyDigestEmailStorageKey,
  buildLegacyDigestSummaryStorageKey,
  buildLegacyItemMarkdownStorageKey,
  buildLegacySummaryRunStorageKey,
  buildUserDigestEmailStorageKey,
  buildUserDigestSummaryStorageKey,
  buildUserItemMarkdownStorageKey,
  buildUserSummaryRunStorageKey
} from "@articlepod/core";
import { migrateMarkdownStorageLayout } from "../src/lib/markdown-storage-layout";
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

test("markdown layout migration dry-run reports item markdown updates without changing metadata", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-dry-run`;
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `markdown-layout-dry-run-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  try {
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        sourceType: "URL",
        sourceUrl: `https://example.com/layout/${uniq}`,
        status: "READY"
      }
    });

    const legacyKey = buildLegacyItemMarkdownStorageKey(item.id);
    const stored = await storage.putObject(legacyKey, Buffer.from(`# Legacy ${uniq}\n\nOriginal markdown.`, "utf8"), {
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

    const summary = await migrateMarkdownStorageLayout({ dryRun: true, userId: user.id });
    const artifact = await prisma.itemArtifact.findFirst({
      where: {
        itemId: item.id,
        kind: "MARKDOWN"
      }
    });

    assert.equal(summary.scanned, 1);
    assert.equal(summary.updated, 1);
    assert.equal(summary.itemMarkdownUpdated, 1);
    assert.equal(summary.metadataUpdated, 1);
    assert.equal(summary.copied, 1);
    assert.equal(artifact?.storageKey, legacyKey);
    await assert.rejects(() => storage.headObject(buildUserItemMarkdownStorageKey(user.id, item.id)));
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("markdown layout migration moves item, digest, and summary markdown into user-centric keys and can clean legacy blobs", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-apply`;
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `markdown-layout-apply-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  try {
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        sourceType: "URL",
        sourceUrl: `https://example.com/layout/apply/${uniq}`,
        status: "READY"
      }
    });
    const digestRun = await prisma.digestRun.create({
      data: {
        userId: user.id,
        cadence: "WEEKLY",
        periodKey: `period-${uniq}`,
        windowStart: new Date("2026-03-01T00:00:00.000Z"),
        windowEnd: new Date("2026-03-08T00:00:00.000Z"),
        scheduledFor: new Date("2026-03-08T00:00:00.000Z"),
        status: "SUCCEEDED",
        targetLengthMinutes: 15,
        sourceItemCount: 1,
        emailEnabled: true,
        podcastEnabled: false,
        summaryStorageKey: buildLegacyDigestSummaryStorageKey(user.id, "WEEKLY", `period-${uniq}`),
        emailStorageKey: buildLegacyDigestEmailStorageKey(user.id, "WEEKLY", `period-${uniq}`),
        summaryBytes: 0
      }
    });
    const summaryRun = await prisma.summaryRun.create({
      data: {
        userId: user.id,
        windowStart: new Date("2026-03-01T00:00:00.000Z"),
        windowEnd: new Date("2026-03-08T00:00:00.000Z"),
        status: "SUCCEEDED",
        targetLengthMinutes: 15,
        selectedItemCount: 1,
        podcastEnabled: false,
        summaryStorageKey: buildLegacySummaryRunStorageKey(user.id, `summary-run-placeholder-${uniq}`),
        summaryBytes: 0
      }
    });

    const itemLegacyKey = buildLegacyItemMarkdownStorageKey(item.id);
    const digestLegacySummaryKey = buildLegacyDigestSummaryStorageKey(user.id, "WEEKLY", `period-${uniq}`);
    const digestLegacyEmailKey = buildLegacyDigestEmailStorageKey(user.id, "WEEKLY", `period-${uniq}`);
    const summaryLegacyKey = buildLegacySummaryRunStorageKey(user.id, summaryRun.id);
    await prisma.summaryRun.update({
      where: { id: summaryRun.id },
      data: {
        summaryStorageKey: summaryLegacyKey
      }
    });

    const [itemStored] = await Promise.all([
      storage.putObject(itemLegacyKey, Buffer.from(`# Item ${uniq}\n\nItem markdown.`, "utf8"), {
        contentType: "text/markdown; charset=utf-8"
      }),
      storage.putObject(digestLegacySummaryKey, Buffer.from(`# Digest ${uniq}\n\nDigest summary markdown.`, "utf8"), {
        contentType: "text/markdown; charset=utf-8"
      }),
      storage.putObject(digestLegacyEmailKey, Buffer.from(`# Digest email ${uniq}\n\nDigest email markdown.`, "utf8"), {
        contentType: "text/markdown; charset=utf-8"
      }),
      storage.putObject(summaryLegacyKey, Buffer.from(`# Summary ${uniq}\n\nManual summary markdown.`, "utf8"), {
        contentType: "text/markdown; charset=utf-8"
      })
    ]);

    await prisma.itemArtifact.create({
      data: {
        itemId: item.id,
        kind: "MARKDOWN",
        storageKey: itemStored.key,
        contentType: "text/markdown; charset=utf-8",
        byteLength: itemStored.bytes
      }
    });

    const applySummary = await migrateMarkdownStorageLayout({ userId: user.id });
    assert.equal(applySummary.scanned, 4);
    assert.equal(applySummary.updated, 4);
    assert.equal(applySummary.itemMarkdownUpdated, 1);
    assert.equal(applySummary.digestSummaryUpdated, 1);
    assert.equal(applySummary.digestEmailUpdated, 1);
    assert.equal(applySummary.summaryRunUpdated, 1);

    const [artifact, refreshedDigestRun, refreshedSummaryRun] = await Promise.all([
      prisma.itemArtifact.findFirst({
        where: {
          itemId: item.id,
          kind: "MARKDOWN"
        }
      }),
      prisma.digestRun.findUnique({ where: { id: digestRun.id } }),
      prisma.summaryRun.findUnique({ where: { id: summaryRun.id } })
    ]);

    assert.equal(artifact?.storageKey, buildUserItemMarkdownStorageKey(user.id, item.id));
    assert.equal(refreshedDigestRun?.summaryStorageKey, buildUserDigestSummaryStorageKey(user.id, "WEEKLY", `period-${uniq}`));
    assert.equal(refreshedDigestRun?.emailStorageKey, buildUserDigestEmailStorageKey(user.id, "WEEKLY", `period-${uniq}`));
    assert.equal(refreshedSummaryRun?.summaryStorageKey, buildUserSummaryRunStorageKey(user.id, summaryRun.id));

    assert.equal((await storage.getObject(buildUserItemMarkdownStorageKey(user.id, item.id))).toString("utf8").includes("Item markdown."), true);
    assert.equal((await storage.getObject(buildUserDigestSummaryStorageKey(user.id, "WEEKLY", `period-${uniq}`))).toString("utf8").includes("Digest summary markdown."), true);
    assert.equal((await storage.getObject(buildUserDigestEmailStorageKey(user.id, "WEEKLY", `period-${uniq}`))).toString("utf8").includes("Digest email markdown."), true);
    assert.equal((await storage.getObject(buildUserSummaryRunStorageKey(user.id, summaryRun.id))).toString("utf8").includes("Manual summary markdown."), true);

    const cleanupSummary = await migrateMarkdownStorageLayout({ userId: user.id, deleteLegacy: true });
    assert.equal(cleanupSummary.legacyDeleted, 4);

    await assert.rejects(() => storage.headObject(itemLegacyKey));
    await assert.rejects(() => storage.headObject(digestLegacySummaryKey));
    await assert.rejects(() => storage.headObject(digestLegacyEmailKey));
    await assert.rejects(() => storage.headObject(summaryLegacyKey));
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
