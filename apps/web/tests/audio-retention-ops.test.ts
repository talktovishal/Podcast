import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { backfillAudioRetention } from "../src/lib/audio-retention-backfill";
import { purgeExpiredAudioEpisodes } from "../src/lib/audio-retention-purge";
import { buildAudioExpiryDate } from "../src/lib/audio-retention";
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

test("audio retention backfill stamps 60-day expiry onto existing item, digest, and summary episodes", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const publishedAt = new Date("2026-01-01T12:00:00.000Z");

  const user = await prisma.user.create({
    data: {
      email: `audio-retention-backfill-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      sourceType: "URL",
      sourceUrl: `https://example.com/audio-retention/${uniq}`,
      status: "READY"
    }
  });

  const digestRun = await prisma.digestRun.create({
    data: {
      userId: user.id,
      cadence: "DAILY",
      periodKey: `audio-retention-${uniq}`,
      windowStart: new Date("2025-12-31T12:00:00.000Z"),
      windowEnd: new Date("2026-01-01T12:00:00.000Z"),
      scheduledFor: publishedAt,
      status: "SUCCEEDED",
      targetLengthMinutes: 5,
      sourceItemCount: 1,
      emailEnabled: false,
      podcastEnabled: true
    }
  });

  const summaryRun = await prisma.summaryRun.create({
    data: {
      userId: user.id,
      windowStart: new Date("2025-12-25T12:00:00.000Z"),
      windowEnd: new Date("2026-01-01T12:00:00.000Z"),
      status: "SUCCEEDED",
      targetLengthMinutes: 15,
      selectedItemCount: 1,
      podcastEnabled: true
    }
  });

  try {
    await prisma.episode.create({
      data: {
        itemId: item.id,
        guid: `episode-${item.id}`,
        title: "Retention item episode",
        description: "Retention item description",
        audioPath: `items/${item.id}/episode.mp3`,
        audioBytes: 128,
        mimeType: "audio/mpeg",
        publishedAt,
        expiresAt: null
      }
    });

    await prisma.digestEpisode.create({
      data: {
        digestRunId: digestRun.id,
        userId: user.id,
        guid: `digest-${digestRun.id}`,
        title: "Retention digest episode",
        description: "Retention digest description",
        audioPath: `digests/${user.id}/${digestRun.id}/episode.mp3`,
        audioBytes: 256,
        mimeType: "audio/mpeg",
        publishedAt,
        expiresAt: null
      }
    });

    await prisma.summaryEpisode.create({
      data: {
        summaryRunId: summaryRun.id,
        userId: user.id,
        guid: `summary-${summaryRun.id}`,
        title: "Retention summary episode",
        description: "Retention summary description",
        audioPath: `summaries/${user.id}/${summaryRun.id}/episode.mp3`,
        audioBytes: 512,
        mimeType: "audio/mpeg",
        publishedAt,
        expiresAt: null
      }
    });

    const dryRun = await backfillAudioRetention({ dryRun: true });
    assert.equal(dryRun.updated >= 3, true);

    const beforeWrite = await Promise.all([
      prisma.episode.findUnique({ where: { itemId: item.id }, select: { expiresAt: true } }),
      prisma.digestEpisode.findUnique({ where: { digestRunId: digestRun.id }, select: { expiresAt: true } }),
      prisma.summaryEpisode.findUnique({ where: { summaryRunId: summaryRun.id }, select: { expiresAt: true } })
    ]);
    assert.equal(beforeWrite[0]?.expiresAt, null);
    assert.equal(beforeWrite[1]?.expiresAt, null);
    assert.equal(beforeWrite[2]?.expiresAt, null);

    const summary = await backfillAudioRetention();
    assert.equal(summary.updated >= 3, true);
    assert.equal(summary.itemEpisodesUpdated >= 1, true);
    assert.equal(summary.digestEpisodesUpdated >= 1, true);
    assert.equal(summary.summaryEpisodesUpdated >= 1, true);

    const expectedExpiry = buildAudioExpiryDate(publishedAt);
    const afterWrite = await Promise.all([
      prisma.episode.findUnique({ where: { itemId: item.id }, select: { expiresAt: true } }),
      prisma.digestEpisode.findUnique({ where: { digestRunId: digestRun.id }, select: { expiresAt: true } }),
      prisma.summaryEpisode.findUnique({ where: { summaryRunId: summaryRun.id }, select: { expiresAt: true } })
    ]);
    assert.equal(afterWrite[0]?.expiresAt?.toISOString(), expectedExpiry.toISOString());
    assert.equal(afterWrite[1]?.expiresAt?.toISOString(), expectedExpiry.toISOString());
    assert.equal(afterWrite[2]?.expiresAt?.toISOString(), expectedExpiry.toISOString());
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("audio retention purge deletes expired item, digest, and summary episode blobs plus metadata rows", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const storage = getArtifactStorage();
  const now = new Date("2026-03-28T18:00:00.000Z");
  const expiredAt = new Date("2026-03-01T00:00:00.000Z");
  const futureAt = new Date("2026-04-15T00:00:00.000Z");

  const user = await prisma.user.create({
    data: {
      email: `audio-retention-purge-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      sourceType: "URL",
      sourceUrl: `https://example.com/audio-purge/${uniq}`,
      status: "READY"
    }
  });

  const digestRun = await prisma.digestRun.create({
    data: {
      userId: user.id,
      cadence: "WEEKLY",
      periodKey: `audio-purge-${uniq}`,
      windowStart: new Date("2026-02-20T12:00:00.000Z"),
      windowEnd: new Date("2026-02-27T12:00:00.000Z"),
      scheduledFor: new Date("2026-02-27T12:00:00.000Z"),
      status: "SUCCEEDED",
      targetLengthMinutes: 15,
      sourceItemCount: 2,
      emailEnabled: false,
      podcastEnabled: true
    }
  });

  const summaryRun = await prisma.summaryRun.create({
    data: {
      userId: user.id,
      windowStart: new Date("2026-02-20T12:00:00.000Z"),
      windowEnd: new Date("2026-02-27T12:00:00.000Z"),
      status: "SUCCEEDED",
      targetLengthMinutes: 15,
      selectedItemCount: 2,
      podcastEnabled: true
    }
  });

  const expiredItemPath = `items/${item.id}/expired-episode.mp3`;
  const freshItemPath = `items/${item.id}/fresh-episode.mp3`;
  const expiredDigestPath = `digests/${user.id}/${digestRun.id}/expired.mp3`;
  const expiredSummaryPath = `summaries/${user.id}/${summaryRun.id}/expired.mp3`;

  try {
    await Promise.all([
      storage.putObject(expiredItemPath, Buffer.from("expired-item", "utf8"), { contentType: "audio/mpeg" }),
      storage.putObject(freshItemPath, Buffer.from("fresh-item", "utf8"), { contentType: "audio/mpeg" }),
      storage.putObject(expiredDigestPath, Buffer.from("expired-digest", "utf8"), { contentType: "audio/mpeg" }),
      storage.putObject(expiredSummaryPath, Buffer.from("expired-summary", "utf8"), { contentType: "audio/mpeg" })
    ]);

    const freshItem = await prisma.item.create({
      data: {
        userId: user.id,
        sourceType: "URL",
        sourceUrl: `https://example.com/audio-purge-fresh/${uniq}`,
        status: "READY"
      }
    });

    await prisma.episode.create({
      data: {
        itemId: item.id,
        guid: `episode-expired-${item.id}`,
        title: "Expired item episode",
        description: "Expired item description",
        audioPath: expiredItemPath,
        audioBytes: 12,
        mimeType: "audio/mpeg",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: expiredAt
      }
    });

    await prisma.episode.create({
      data: {
        itemId: freshItem.id,
        guid: `episode-fresh-${freshItem.id}`,
        title: "Fresh item episode",
        description: "Fresh item description",
        audioPath: freshItemPath,
        audioBytes: 10,
        mimeType: "audio/mpeg",
        publishedAt: new Date("2026-03-20T00:00:00.000Z"),
        expiresAt: futureAt
      }
    });

    await prisma.digestEpisode.create({
      data: {
        digestRunId: digestRun.id,
        userId: user.id,
        guid: `digest-expired-${digestRun.id}`,
        title: "Expired digest episode",
        description: "Expired digest description",
        audioPath: expiredDigestPath,
        audioBytes: 14,
        mimeType: "audio/mpeg",
        publishedAt: new Date("2026-01-15T00:00:00.000Z"),
        expiresAt: expiredAt
      }
    });

    await prisma.summaryEpisode.create({
      data: {
        summaryRunId: summaryRun.id,
        userId: user.id,
        guid: `summary-expired-${summaryRun.id}`,
        title: "Expired summary episode",
        description: "Expired summary description",
        audioPath: expiredSummaryPath,
        audioBytes: 15,
        mimeType: "audio/mpeg",
        publishedAt: new Date("2026-01-20T00:00:00.000Z"),
        expiresAt: expiredAt
      }
    });

    const summary = await purgeExpiredAudioEpisodes(now);
    assert.equal(summary.itemEpisodesPurged, 1);
    assert.equal(summary.digestEpisodesPurged, 1);
    assert.equal(summary.summaryEpisodesPurged, 1);

    assert.equal(await storage.headObject(expiredItemPath).then(() => true).catch(() => false), false);
    assert.equal(await storage.headObject(expiredDigestPath).then(() => true).catch(() => false), false);
    assert.equal(await storage.headObject(expiredSummaryPath).then(() => true).catch(() => false), false);
    assert.equal(await storage.headObject(freshItemPath).then(() => true).catch(() => false), true);

    assert.equal(await prisma.episode.count({ where: { audioPath: expiredItemPath } }), 0);
    assert.equal(await prisma.digestEpisode.count({ where: { audioPath: expiredDigestPath } }), 0);
    assert.equal(await prisma.summaryEpisode.count({ where: { audioPath: expiredSummaryPath } }), 0);
    assert.equal(await prisma.episode.count({ where: { audioPath: freshItemPath } }), 1);
  } finally {
    await storage.deleteObject(expiredItemPath).catch(() => undefined);
    await storage.deleteObject(freshItemPath).catch(() => undefined);
    await storage.deleteObject(expiredDigestPath).catch(() => undefined);
    await storage.deleteObject(expiredSummaryPath).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});
