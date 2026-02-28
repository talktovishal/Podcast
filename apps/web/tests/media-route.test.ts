import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { GET, HEAD } from "../src/app/api/media/[...path]/route";
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

test("media route supports HEAD and byte-range responses", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const storage = getArtifactStorage();
  const key = `tests/media-${uniq}.mp3`;
  const payload = Buffer.from("0123456789", "utf8");
  await storage.putObject(key, payload, { contentType: "audio/mpeg" });

  const user = await prisma.user.create({
    data: {
      email: `media-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  // Media tokens are HMAC-signed path tokens; in test env (no MEDIA_SIGNING_KEY), any non-empty mt param is accepted
  const testMediaToken = "test-token";

  try {
    const headRequest = new NextRequest(`http://localhost/api/media/${key}?mt=${testMediaToken}`, {
      method: "HEAD"
    });

    const headResponse = await HEAD(headRequest, { params: { path: key.split("/") } });
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get("content-type"), "audio/mpeg");
    assert.equal(headResponse.headers.get("content-length"), String(payload.byteLength));
    assert.equal(headResponse.headers.get("accept-ranges"), "bytes");

    const fullRequest = new NextRequest(`http://localhost/api/media/${key}?mt=${testMediaToken}`, {
      method: "GET"
    });

    const fullResponse = await GET(fullRequest, { params: { path: key.split("/") } });
    assert.equal(fullResponse.status, 200);
    assert.equal(fullResponse.headers.get("content-length"), String(payload.byteLength));
    const fullBody = Buffer.from(await fullResponse.arrayBuffer()).toString("utf8");
    assert.equal(fullBody, "0123456789");

    const rangeRequest = new NextRequest(`http://localhost/api/media/${key}?mt=${testMediaToken}`, {
      method: "GET",
      headers: {
        range: "bytes=2-5"
      }
    });

    const rangeResponse = await GET(rangeRequest, { params: { path: key.split("/") } });
    assert.equal(rangeResponse.status, 206);
    assert.equal(rangeResponse.headers.get("content-range"), `bytes 2-5/${payload.byteLength}`);
    const rangeBody = Buffer.from(await rangeResponse.arrayBuffer()).toString("utf8");
    assert.equal(rangeBody, "2345");

    const suffixRangeRequest = new NextRequest(`http://localhost/api/media/${key}?mt=${testMediaToken}`, {
      method: "GET",
      headers: {
        range: "bytes=-4"
      }
    });
    const suffixRangeResponse = await GET(suffixRangeRequest, { params: { path: key.split("/") } });
    assert.equal(suffixRangeResponse.status, 206);
    assert.equal(suffixRangeResponse.headers.get("content-range"), `bytes 6-9/${payload.byteLength}`);
    const suffixRangeBody = Buffer.from(await suffixRangeResponse.arrayBuffer()).toString("utf8");
    assert.equal(suffixRangeBody, "6789");

    const invalidRangeRequest = new NextRequest(`http://localhost/api/media/${key}?mt=${testMediaToken}`, {
      method: "GET",
      headers: {
        range: "bytes=99-100"
      }
    });

    const invalidRangeResponse = await GET(invalidRangeRequest, { params: { path: key.split("/") } });
    assert.equal(invalidRangeResponse.status, 416);

    const invalidSuffixRangeRequest = new NextRequest(`http://localhost/api/media/${key}?mt=${testMediaToken}`, {
      method: "GET",
      headers: {
        range: "bytes=-0"
      }
    });
    const invalidSuffixRangeResponse = await GET(invalidSuffixRangeRequest, { params: { path: key.split("/") } });
    assert.equal(invalidSuffixRangeResponse.status, 416);

    const unauthorizedRequest = new NextRequest(`http://localhost/api/media/${key}`, {
      method: "GET"
    });
    const unauthorizedResponse = await GET(unauthorizedRequest, { params: { path: key.split("/") } });
    assert.equal(unauthorizedResponse.status, 401);
  } finally {
    await storage.deleteObject(key);
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("media route rejects path traversal attempts", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const user = await prisma.user.create({
    data: {
      email: `media-traversal-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  const testMediaToken = "test-token";

  try {
    const traversalPaths = [
      ["items", "..", "..", "etc", "passwd"],
      ["..", "etc", "shadow"],
      ["valid", "path", "..", "..", "escape"]
    ];

    for (const pathSegments of traversalPaths) {
      const getRequest = new NextRequest(
        `http://localhost/api/media/${pathSegments.join("/")}?mt=${testMediaToken}`
      );
      const getResponse = await GET(getRequest, { params: { path: pathSegments } });
      assert.equal(getResponse.status, 400, `GET should reject traversal: ${pathSegments.join("/")}`);

      const headRequest = new NextRequest(
        `http://localhost/api/media/${pathSegments.join("/")}?mt=${testMediaToken}`,
        { method: "HEAD" }
      );
      const headResponse = await HEAD(headRequest, { params: { path: pathSegments } });
      assert.equal(headResponse.status, 400, `HEAD should reject traversal: ${pathSegments.join("/")}`);
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("media route 404 enqueues repair for missing episode media", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const user = await prisma.user.create({
    data: {
      email: `media-repair-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  const testMediaToken = "test-token";

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      sourceType: "URL",
      sourceUrl: `https://example.com/${uniq}`,
      status: "READY"
    }
  });
  const missingPath = `items/${item.id}/episode.mp3`;
  const episode = await prisma.episode.create({
    data: {
      itemId: item.id,
      guid: `episode-${item.id}`,
      title: `Missing media ${uniq}`,
      description: "missing media",
      audioPath: missingPath,
      audioBytes: 1024,
      mimeType: "audio/mpeg",
      publishedAt: new Date()
    }
  });

  await prisma.chunkCache.create({
    data: {
      itemId: item.id,
      chunkIndex: 0,
      hash: `hash-${uniq}`,
      filePath: missingPath,
      audioBytes: 1024,
      mimeType: "audio/mpeg"
    }
  });

  try {
    const response = await GET(
      new NextRequest(`http://localhost/api/media/${missingPath}?mt=${testMediaToken}&eid=${episode.id}`),
      { params: { path: missingPath.split("/") } }
    );
    assert.equal(response.status, 404);

    const refreshedItem = await prisma.item.findUnique({ where: { id: item.id }, select: { status: true, errorMessage: true } });
    assert.equal(refreshedItem?.status, "QUEUED");
    assert.equal((refreshedItem?.errorMessage || "").includes("regeneration"), true);

    const queuedJobs = await prisma.job.findMany({
      where: {
        itemId: item.id,
        status: "QUEUED"
      }
    });
    assert.equal(queuedJobs.length > 0, true);

    const cacheRows = await prisma.chunkCache.count({ where: { itemId: item.id } });
    assert.equal(cacheRows, 0);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("media route reconciles alternate audio path when expected media is missing", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `media-reconcile-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  const testMediaToken = "test-token";

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      sourceType: "PDF",
      sourceFilePath: null,
      status: "QUEUED",
      jobs: {
        create: {
          status: "QUEUED",
          attempt: 0
        }
      }
    }
  });

  const missingPath = `items/${item.id}/episode.mp3`;
  const alternatePath = `items/${item.id}/episode.m4a`;
  const alternatePayload = Buffer.from("reconciled-audio", "utf8");
  await storage.putObject(alternatePath, alternatePayload, { contentType: "audio/mp4" });

  const episode = await prisma.episode.create({
    data: {
      itemId: item.id,
      guid: `episode-${item.id}`,
      title: `Reconcile media ${uniq}`,
      description: "reconcile media",
      audioPath: missingPath,
      audioBytes: 1024,
      mimeType: "audio/mpeg",
      publishedAt: new Date()
    }
  });

  try {
    const response = await GET(
      new NextRequest(`http://localhost/api/media/${missingPath}?mt=${testMediaToken}&eid=${episode.id}`),
      { params: { path: missingPath.split("/") } }
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/mp4");
    const body = Buffer.from(await response.arrayBuffer()).toString("utf8");
    assert.equal(body, "reconciled-audio");

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

test("media route does not enqueue repair jobs for non-regenerable items", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const user = await prisma.user.create({
    data: {
      email: `media-noqueue-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  const testMediaToken = "test-token";

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      sourceType: "PDF",
      sourceFilePath: null,
      status: "READY"
    }
  });
  const missingPath = `items/${item.id}/episode.mp3`;
  const episode = await prisma.episode.create({
    data: {
      itemId: item.id,
      guid: `episode-${item.id}`,
      title: `No queue media ${uniq}`,
      description: "no queue media",
      audioPath: missingPath,
      audioBytes: 1024,
      mimeType: "audio/mpeg",
      publishedAt: new Date()
    }
  });

  try {
    const response = await GET(
      new NextRequest(`http://localhost/api/media/${missingPath}?mt=${testMediaToken}&eid=${episode.id}`),
      { params: { path: missingPath.split("/") } }
    );
    assert.equal(response.status, 404);

    const refreshedItem = await prisma.item.findUnique({
      where: { id: item.id },
      select: { status: true }
    });
    assert.equal(refreshedItem?.status, "READY");

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
