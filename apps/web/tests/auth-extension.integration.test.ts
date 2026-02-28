import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { chunkText, sha256 } from "@articlepod/core";
import { extractHtmlSnapshot } from "@articlepod/core/src/extract/html";
import { POST as connectCodePost } from "../src/app/api/auth/extension/connect-code/route";
import { POST as exchangePost } from "../src/app/api/auth/extension/exchange/route";
import { POST as htmlSnapshotPost } from "../src/app/api/items/html-snapshot/route";
import { GET as seedDemoGet } from "../src/app/api/seed-demo/route";
import { GET as rssGet } from "../src/app/rss/[token]/route";
import { createSession, ensureUserFeedToken, findOrCreateOAuthUser } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";
import { getArtifactStorage } from "../src/lib/storage";
import { processJob } from "../../worker/src/jobs/processItemJob";

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

test("findOrCreateOAuthUser links identities by provider subject and email", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const email = `oauth-${uniq}@articlepod.local`;

  const first = await findOrCreateOAuthUser({
    provider: "google",
    providerUserId: `g-${uniq}`,
    email,
    name: "OAuth One"
  });

  const again = await findOrCreateOAuthUser({
    provider: "google",
    providerUserId: `g-${uniq}`,
    email,
    name: "OAuth Updated"
  });

  assert.equal(again.user.id, first.user.id);
  assert.equal(again.user.name, "OAuth Updated");
  assert.equal(first.created, true);
  assert.equal(again.created, false);

  const secondProvider = await findOrCreateOAuthUser({
    provider: "apple",
    providerUserId: `a-${uniq}`,
    email,
    name: "OAuth Apple"
  });

  assert.equal(secondProvider.user.id, first.user.id);

  const identities = await prisma.oAuthIdentity.findMany({
    where: {
      userId: first.user.id
    }
  });

  assert.equal(identities.length, 2);

  await prisma.user.delete({ where: { id: first.user.id } });
});

test("extension connect + html snapshot submission reaches user feed", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const user = await prisma.user.create({
    data: {
      email: `ext-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const sessionToken = await createSession(user.id);

    const connectRequest = new NextRequest("http://localhost/api/auth/extension/connect-code", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `articlepod_session=${sessionToken}`
      },
      body: JSON.stringify({ label: "integration-test" })
    });

    const connectResponse = await connectCodePost(connectRequest);
    assert.equal(connectResponse.status, 200);
    const connectPayload = (await connectResponse.json()) as {
      connect_code: string;
    };
    assert.ok(connectPayload.connect_code.length > 20);

    const exchangeRequest = new NextRequest("http://localhost/api/auth/extension/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        connectCode: connectPayload.connect_code,
        label: "integration-test"
      })
    });

    const exchangeResponse = await exchangePost(exchangeRequest);
    assert.equal(exchangeResponse.status, 200);
    const exchangePayload = (await exchangeResponse.json()) as {
      extension_token: string;
    };
    assert.ok(exchangePayload.extension_token.length > 20);

    const replayExchangeRequest = new NextRequest("http://localhost/api/auth/extension/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        connectCode: connectPayload.connect_code,
        label: "integration-test"
      })
    });

    const replayResponse = await exchangePost(replayExchangeRequest);
    assert.equal(replayResponse.status, 401);

    const html = `
      <html>
        <head><title>Extension Snapshot ${uniq}</title></head>
        <body>
          <article>
            <h1>Extension Snapshot ${uniq}</h1>
            <p>This page was captured from the browser extension and should be converted into a podcast episode successfully.</p>
            <p>The content includes enough words to pass extraction minimums and deterministic chunking requirements for worker processing.</p>
            <p>Unique marker ${uniq} ensures test cache keys remain isolated from other runs.</p>
          </article>
        </body>
      </html>
    `;

    const submitRequest = new NextRequest("http://localhost/api/items/html-snapshot", {
      method: "POST",
      headers: {
        authorization: `Bearer ${exchangePayload.extension_token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        url: `https://example.com/private/${uniq}`,
        title: `Captured ${uniq}`,
        html,
        capturedAt: new Date().toISOString()
      })
    });

    const submitResponse = await htmlSnapshotPost(submitRequest);
    assert.equal(submitResponse.status, 200);

    const submitPayload = (await submitResponse.json()) as {
      item_id: string;
    };

    const refreshRequest = new NextRequest("http://localhost/api/seed-demo?refresh=items", {
      headers: {
        cookie: `articlepod_session=${sessionToken}`
      }
    });
    const refreshResponse = await seedDemoGet(refreshRequest);
    assert.equal(refreshResponse.status, 200);
    const refreshPayload = (await refreshResponse.json()) as {
      ok: boolean;
      items: Array<{
        id: string;
        status: string;
      }>;
    };
    assert.equal(refreshPayload.ok, true);
    const queuedItem = refreshPayload.items.find((entry) => entry.id === submitPayload.item_id);
    assert.equal(queuedItem?.status, "QUEUED");

    const createdItem = await prisma.item.findUnique({
      where: { id: submitPayload.item_id },
      include: {
        jobs: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      }
    });

    assert.ok(createdItem);
    assert.equal(createdItem?.userId, user.id);
    assert.equal(createdItem?.sourceType, "HTML_SNAPSHOT");
    assert.ok(createdItem?.sourceFilePath?.endsWith(".html"));
    assert.equal(createdItem?.sourceHtml, null);

    const extracted = extractHtmlSnapshot({
      html,
      url: `https://example.com/private/${uniq}`
    });
    const chunks = chunkText(extracted.text);
    const cacheKey = sha256([user.id, "kokoro", "af_heart", ...chunks.map((chunk) => chunk.hash)].join("|"));
    const cachedAudioPath = `items/test-${uniq}/episode.mp3`;
    await getArtifactStorage().putObject(cachedAudioPath, Buffer.from("cached-audio", "utf8"), {
      contentType: "audio/mpeg"
    });

    await prisma.chunkCache.create({
      data: {
        itemId: createdItem!.id,
        chunkIndex: 0,
        hash: cacheKey,
        filePath: cachedAudioPath,
        audioBytes: 2048,
        mimeType: "audio/mpeg"
      }
    });

    const queuedJob = createdItem?.jobs[0];
    assert.ok(queuedJob);

    const processed = await processJob(queuedJob!.id);
    assert.equal(processed, true);

    const finishedItem = await prisma.item.findUnique({
      where: { id: createdItem!.id },
      include: { episode: true }
    });
    assert.equal(finishedItem?.status, "READY");
    assert.ok(finishedItem?.episode);
    assert.equal(finishedItem?.sourceHtml, null);
    assert.ok(finishedItem?.sourceCapturedAt instanceof Date);

    const feedToken = await ensureUserFeedToken(user.id);
    const feedRequest = new NextRequest(`http://localhost/rss/${feedToken}.xml`);
    const feedResponse = await rssGet(feedRequest, { params: { token: feedToken } });
    assert.equal(feedResponse.status, 200);

    const feedXml = await feedResponse.text();
    assert.ok(feedXml.includes("<item>"));
    assert.ok(feedXml.includes("Captured"));
    assert.ok(feedXml.includes("episode-"));
    assert.ok(feedXml.includes("<itunes:image "));
    assert.ok(feedXml.includes("<image>"));
    assert.ok(feedXml.includes("/brand/podcast-cover-1400.png"));
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
