import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createSecretToken } from "@articlepod/core";
import {
  ensureUserDigestFeedToken,
  ensureUserDigestFeedTokenAccess,
  ensureUserFeedToken,
  ensureUserFeedTokenAccess,
  rotateDigestFeedToken,
  rotateFeedToken
} from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

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

test("ensureUserFeedToken keeps the same active item feed URL once issued", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-feed-stable`;
  const user = await prisma.user.create({
    data: {
      email: `feed-stable-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  try {
    const first = await ensureUserFeedToken(user.id);
    const second = await ensureUserFeedToken(user.id);
    assert.equal(first, second);

    const activeRows = await prisma.feedToken.findMany({
      where: { userId: user.id, active: true },
      select: { tokenHash: true, tokenValue: true }
    });
    assert.equal(activeRows.length, 1);
    assert.equal(activeRows[0]?.tokenValue, first);
    assert.equal(activeRows[0]?.tokenHash.length, 64);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("legacy hash-only active feed rows stay active until the user rotates them explicitly", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-feed-legacy`;
  const user = await prisma.user.create({
    data: {
      email: `feed-legacy-${uniq}@articlepod.local`,
      role: "USER"
    }
  });
  const legacyToken = createSecretToken();

  try {
    const existing = await prisma.feedToken.create({
      data: {
        userId: user.id,
        tokenHash: legacyToken.hash,
        tokenValue: null,
        active: true
      }
    });

    const access = await ensureUserFeedTokenAccess(user.id);
    assert.equal(access.tokenHash, legacyToken.hash);
    assert.equal(access.tokenValue, null);
    await assert.rejects(
      () => ensureUserFeedToken(user.id),
      /private URL is not displayable/
    );

    const activeRows = await prisma.feedToken.findMany({
      where: { userId: user.id, active: true },
      select: { id: true, tokenHash: true, tokenValue: true }
    });
    assert.equal(activeRows.length, 1);
    assert.equal(activeRows[0]?.id, existing.id);
    assert.equal(activeRows[0]?.tokenHash, legacyToken.hash);
    assert.equal(activeRows[0]?.tokenValue, null);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("rotated item and digest feed URLs remain readable after rotation", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-feed-rotate`;
  const user = await prisma.user.create({
    data: {
      email: `feed-rotate-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  try {
    const originalItem = await ensureUserFeedToken(user.id);
    const rotatedItem = await rotateFeedToken(user.id);
    const currentItem = await ensureUserFeedToken(user.id);
    assert.notEqual(rotatedItem, originalItem);
    assert.equal(currentItem, rotatedItem);

    const originalDigest = await ensureUserDigestFeedToken(user.id);
    const rotatedDigest = await rotateDigestFeedToken(user.id);
    const currentDigest = await ensureUserDigestFeedToken(user.id);
    assert.notEqual(rotatedDigest, originalDigest);
    assert.equal(currentDigest, rotatedDigest);

    const activeItem = await prisma.feedToken.findFirst({
      where: { userId: user.id, active: true },
      select: { tokenValue: true }
    });
    const activeDigest = await prisma.digestFeedToken.findFirst({
      where: { userId: user.id, active: true },
      select: { tokenValue: true }
    });
    assert.equal(activeItem?.tokenValue, rotatedItem);
    assert.equal(activeDigest?.tokenValue, rotatedDigest);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("legacy hash-only digest rows stay active until the user rotates them explicitly", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-digest-legacy`;
  const user = await prisma.user.create({
    data: {
      email: `digest-legacy-${uniq}@articlepod.local`,
      role: "USER"
    }
  });
  const legacyToken = createSecretToken();

  try {
    const existing = await prisma.digestFeedToken.create({
      data: {
        userId: user.id,
        tokenHash: legacyToken.hash,
        tokenValue: null,
        active: true
      }
    });

    const access = await ensureUserDigestFeedTokenAccess(user.id);
    assert.equal(access.tokenHash, legacyToken.hash);
    assert.equal(access.tokenValue, null);
    await assert.rejects(
      () => ensureUserDigestFeedToken(user.id),
      /private URL is not displayable/
    );

    const activeRows = await prisma.digestFeedToken.findMany({
      where: { userId: user.id, active: true },
      select: { id: true, tokenHash: true, tokenValue: true }
    });
    assert.equal(activeRows.length, 1);
    assert.equal(activeRows[0]?.id, existing.id);
    assert.equal(activeRows[0]?.tokenHash, legacyToken.hash);
    assert.equal(activeRows[0]?.tokenValue, null);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
