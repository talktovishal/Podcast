import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSecretToken } from "@articlepod/core";
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

  const feedToken = createSecretToken();
  await prisma.feedToken.create({
    data: {
      userId: user.id,
      tokenValue: feedToken.plain,
      tokenHash: feedToken.hash,
      active: true
    }
  });

  try {
    const headRequest = new NextRequest(`http://localhost/api/media/${key}?feed_token=${feedToken.plain}`, {
      method: "HEAD"
    });

    const headResponse = await HEAD(headRequest, { params: { path: key.split("/") } });
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get("content-type"), "audio/mpeg");
    assert.equal(headResponse.headers.get("content-length"), String(payload.byteLength));
    assert.equal(headResponse.headers.get("accept-ranges"), "bytes");

    const fullRequest = new NextRequest(`http://localhost/api/media/${key}?feed_token=${feedToken.plain}`, {
      method: "GET"
    });

    const fullResponse = await GET(fullRequest, { params: { path: key.split("/") } });
    assert.equal(fullResponse.status, 200);
    assert.equal(fullResponse.headers.get("content-length"), String(payload.byteLength));
    const fullBody = Buffer.from(await fullResponse.arrayBuffer()).toString("utf8");
    assert.equal(fullBody, "0123456789");

    const rangeRequest = new NextRequest(`http://localhost/api/media/${key}?feed_token=${feedToken.plain}`, {
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

    const suffixRangeRequest = new NextRequest(`http://localhost/api/media/${key}?feed_token=${feedToken.plain}`, {
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

    const invalidRangeRequest = new NextRequest(`http://localhost/api/media/${key}?feed_token=${feedToken.plain}`, {
      method: "GET",
      headers: {
        range: "bytes=99-100"
      }
    });

    const invalidRangeResponse = await GET(invalidRangeRequest, { params: { path: key.split("/") } });
    assert.equal(invalidRangeResponse.status, 416);

    const invalidSuffixRangeRequest = new NextRequest(`http://localhost/api/media/${key}?feed_token=${feedToken.plain}`, {
      method: "GET",
      headers: {
        range: "bytes=-0"
      }
    });
    const invalidSuffixRangeResponse = await GET(invalidSuffixRangeRequest, { params: { path: key.split("/") } });
    assert.equal(invalidSuffixRangeResponse.status, 416);

    const unauthorizedRequest = new NextRequest(`http://localhost/api/media/${key}?feed_token=bad-token`, {
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

  const feedToken = createSecretToken();
  await prisma.feedToken.create({
    data: {
      userId: user.id,
      tokenValue: feedToken.plain,
      tokenHash: feedToken.hash,
      active: true
    }
  });

  try {
    const traversalPaths = [
      ["items", "..", "..", "etc", "passwd"],
      ["..", "etc", "shadow"],
      ["valid", "path", "..", "..", "escape"]
    ];

    for (const pathSegments of traversalPaths) {
      const getRequest = new NextRequest(
        `http://localhost/api/media/${pathSegments.join("/")}?feed_token=${feedToken.plain}`
      );
      const getResponse = await GET(getRequest, { params: { path: pathSegments } });
      assert.equal(getResponse.status, 400, `GET should reject traversal: ${pathSegments.join("/")}`);

      const headRequest = new NextRequest(
        `http://localhost/api/media/${pathSegments.join("/")}?feed_token=${feedToken.plain}`,
        { method: "HEAD" }
      );
      const headResponse = await HEAD(headRequest, { params: { path: pathSegments } });
      assert.equal(headResponse.status, 400, `HEAD should reject traversal: ${pathSegments.join("/")}`);
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
