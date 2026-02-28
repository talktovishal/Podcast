import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createSecretToken } from "@articlepod/core";
import { NextRequest } from "next/server";
import { DELETE as deleteItemRoute } from "../src/app/api/items/[id]/route";
import { GET as rssGet } from "../src/app/rss/[token]/route";
import { createSession } from "../src/lib/auth";
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

test("deleted item is removed from RSS feed output", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `rss-delete-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  const feedToken = createSecretToken();
  await prisma.feedToken.create({
    data: {
      userId: user.id,
      tokenValue: feedToken.plain,
      tokenHash: feedToken.hash,
      active: true
    }
  });

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      sourceType: "URL",
      sourceUrl: `https://example.com/delete/${uniq}`,
      status: "READY"
    }
  });
  const audioPath = `items/${item.id}/episode.mp3`;
  await storage.putObject(audioPath, Buffer.from("rss-delete-audio", "utf8"), {
    contentType: "audio/mpeg"
  });

  const episode = await prisma.episode.create({
    data: {
      itemId: item.id,
      guid: `episode-${item.id}`,
      title: `Delete RSS ${uniq}`,
      description: "delete rss",
      audioPath,
      audioBytes: 16,
      mimeType: "audio/mpeg",
      publishedAt: new Date()
    }
  });

  const session = await createSession(user.id);

  try {
    const beforeDelete = await rssGet(new NextRequest(`http://localhost/rss/${feedToken.plain}.xml`), {
      params: { token: feedToken.plain }
    });
    assert.equal(beforeDelete.status, 200);
    const beforeXml = await beforeDelete.text();
    assert.equal(beforeXml.includes(episode.guid), true);

    const deleteResponse = await deleteItemRoute(
      new NextRequest(`http://localhost/api/items/${item.id}`, {
        method: "DELETE",
        headers: {
          cookie: `articlepod_session=${session}`
        }
      }),
      { params: { id: item.id } }
    );
    assert.equal(deleteResponse.status, 200);

    const afterDelete = await rssGet(new NextRequest(`http://localhost/rss/${feedToken.plain}.xml`), {
      params: { token: feedToken.plain }
    });
    assert.equal(afterDelete.status, 200);
    const afterXml = await afterDelete.text();
    assert.equal(afterXml.includes(episode.guid), false);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("rss feed skips missing media episodes and enqueues repair", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-missing`;

  const user = await prisma.user.create({
    data: {
      email: `rss-missing-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  const feedToken = createSecretToken();
  await prisma.feedToken.create({
    data: {
      userId: user.id,
      tokenValue: feedToken.plain,
      tokenHash: feedToken.hash,
      active: true
    }
  });

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      sourceType: "URL",
      sourceUrl: `https://example.com/missing/${uniq}`,
      status: "READY"
    }
  });
  const missingPath = `items/${item.id}/episode.mp3`;
  const episode = await prisma.episode.create({
    data: {
      itemId: item.id,
      guid: `episode-${item.id}`,
      title: `Missing RSS ${uniq}`,
      description: "missing rss",
      audioPath: missingPath,
      audioBytes: 999,
      mimeType: "audio/mpeg",
      publishedAt: new Date()
    }
  });
  await prisma.chunkCache.create({
    data: {
      itemId: item.id,
      chunkIndex: 0,
      hash: `rss-missing-${uniq}`,
      filePath: missingPath,
      audioBytes: 999,
      mimeType: "audio/mpeg"
    }
  });

  try {
    const response = await rssGet(new NextRequest(`http://localhost/rss/${feedToken.plain}.xml`), {
      params: { token: feedToken.plain }
    });
    assert.equal(response.status, 200);
    const xml = await response.text();
    assert.equal(xml.includes(episode.guid), false);

    const refreshedItem = await prisma.item.findUnique({
      where: { id: item.id },
      select: { status: true, errorMessage: true }
    });
    assert.equal(refreshedItem?.status, "QUEUED");
    assert.equal((refreshedItem?.errorMessage || "").includes("regeneration"), true);

    const queuedJobs = await prisma.job.count({
      where: {
        itemId: item.id,
        status: "QUEUED"
      }
    });
    assert.equal(queuedJobs > 0, true);

    const cacheRows = await prisma.chunkCache.count({ where: { itemId: item.id } });
    assert.equal(cacheRows, 0);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("rss feed keeps episode when alternate media path exists", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-reconcile`;
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `rss-reconcile-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  const feedToken = createSecretToken();
  await prisma.feedToken.create({
    data: {
      userId: user.id,
      tokenValue: feedToken.plain,
      tokenHash: feedToken.hash,
      active: true
    }
  });

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      sourceType: "PDF",
      sourceFilePath: null,
      status: "READY"
    }
  });
  await prisma.job.create({
    data: {
      itemId: item.id,
      status: "QUEUED",
      attempt: 0
    }
  });
  const missingPath = `items/${item.id}/episode.mp3`;
  const alternatePath = `items/${item.id}/episode.m4a`;
  const alternatePayload = Buffer.from("rss-reconcile-audio", "utf8");
  await storage.putObject(alternatePath, alternatePayload, {
    contentType: "audio/mp4"
  });

  const episode = await prisma.episode.create({
    data: {
      itemId: item.id,
      guid: `episode-${item.id}`,
      title: `Reconcile RSS ${uniq}`,
      description: "reconcile rss",
      audioPath: missingPath,
      audioBytes: 1000,
      mimeType: "audio/mpeg",
      publishedAt: new Date()
    }
  });

  try {
    const response = await rssGet(new NextRequest(`http://localhost/rss/${feedToken.plain}.xml`), {
      params: { token: feedToken.plain }
    });
    assert.equal(response.status, 200);
    const xml = await response.text();
    assert.equal(xml.includes(episode.guid), true);
    assert.equal(xml.includes(alternatePath), true);
    assert.equal(xml.includes('type="audio/mp4"'), true);

    const refreshedEpisode = await prisma.episode.findUnique({
      where: { id: episode.id },
      select: { audioPath: true, mimeType: true, audioBytes: true }
    });
    assert.equal(refreshedEpisode?.audioPath, alternatePath);
    assert.equal(refreshedEpisode?.mimeType, "audio/mp4");
    assert.equal(refreshedEpisode?.audioBytes, alternatePayload.byteLength);

    const refreshedItem = await prisma.item.findUnique({
      where: { id: item.id },
      select: { status: true, errorCode: true }
    });
    assert.equal(refreshedItem?.status, "READY");
    assert.equal(refreshedItem?.errorCode, null);

    const queuedJobs = await prisma.job.count({
      where: {
        itemId: item.id,
        status: "QUEUED"
      }
    });
    assert.equal(queuedJobs, 0);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
