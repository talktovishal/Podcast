import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { GET as summaryItemsGet } from "../src/app/api/summary/items/route";
import { GET as summaryMarkdownGet } from "../src/app/api/summary/runs/[id]/markdown/route";
import { GET as summaryRunsGet, POST as summaryRunsPost } from "../src/app/api/summary/runs/route";
import { createSession, ensureUserDigestFeedToken } from "../src/lib/auth";
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

test("summary items route requires auth", async () => {
  const response = await summaryItemsGet(new NextRequest("http://localhost/api/summary/items"));
  assert.equal(response.status, 401);
});

test("summary routes list ready items, enforce max selection, and load markdown", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `summary-route-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const session = await createSession(user.id);
    const recentItem = await prisma.item.create({
      data: {
        userId: user.id,
        title: "Recent article",
        sourceType: "URL",
        sourceUrl: "https://example.com/recent",
        status: "READY",
        createdAt: new Date()
      }
    });
    const oldItem = await prisma.item.create({
      data: {
        userId: user.id,
        title: "Older article",
        sourceType: "URL",
        sourceUrl: "https://example.com/older",
        status: "READY",
        createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000)
      }
    });

    for (const item of [recentItem, oldItem]) {
      const stored = await storage.putObject(`items/${item.id}/artifacts/source.md`, Buffer.from(`# ${item.title}\n\nBody`, "utf8"), {
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
    }

    const itemsResponse = await summaryItemsGet(
      new NextRequest("http://localhost/api/summary/items", {
        headers: {
          cookie: `articlepod_session=${session}`
        }
      })
    );
    assert.equal(itemsResponse.status, 200);
    const itemsPayload = (await itemsResponse.json()) as { ok: boolean; items: Array<{ id: string; defaultSelected: boolean }> };
    assert.equal(itemsPayload.ok, true);
    assert.equal(itemsPayload.items.length >= 2, true);
    const recentListed = itemsPayload.items.find((item) => item.id === recentItem.id);
    const oldListed = itemsPayload.items.find((item) => item.id === oldItem.id);
    assert.equal(recentListed?.defaultSelected, true);
    assert.equal(oldListed?.defaultSelected, false);

    const tooManyResponse = await summaryRunsPost(
      new NextRequest("http://localhost/api/summary/runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `articlepod_session=${session}`
        },
        body: JSON.stringify({
          itemIds: Array.from({ length: 31 }, () => recentItem.id),
          targetLengthMinutes: 15,
          podcastEnabled: true
        })
      })
    );
    assert.equal(tooManyResponse.status, 400);

    const createResponse = await summaryRunsPost(
      new NextRequest("http://localhost/api/summary/runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `articlepod_session=${session}`
        },
        body: JSON.stringify({
          itemIds: [recentItem.id, oldItem.id],
          requestedTitle: "Manual studio run",
          targetLengthMinutes: 15,
          podcastEnabled: false
        })
      })
    );
    assert.equal(createResponse.status, 200);
    const createPayload = (await createResponse.json()) as { ok: boolean; run: { id: string } };
    assert.equal(createPayload.ok, true);

    const runsResponse = await summaryRunsGet(
      new NextRequest("http://localhost/api/summary/runs?limit=10", {
        headers: {
          cookie: `articlepod_session=${session}`
        }
      })
    );
    assert.equal(runsResponse.status, 200);
    const runsPayload = (await runsResponse.json()) as { ok: boolean; runs: Array<{ id: string }> };
    assert.equal(runsPayload.ok, true);
    assert.equal(runsPayload.runs.some((run) => run.id === createPayload.run.id), true);

    const storedSummary = await storage.putObject(`summaries/${user.id}/${createPayload.run.id}/summary.md`, Buffer.from("# Manual studio run", "utf8"), {
      contentType: "text/markdown; charset=utf-8"
    });
    await prisma.summaryRun.update({
      where: { id: createPayload.run.id },
      data: {
        status: "SUCCEEDED",
        title: "Manual studio run",
        summaryStorageKey: storedSummary.key,
        summaryBytes: storedSummary.bytes
      }
    });

    const markdownResponse = await summaryMarkdownGet(
      new NextRequest(`http://localhost/api/summary/runs/${createPayload.run.id}/markdown`, {
        headers: {
          cookie: `articlepod_session=${session}`
        }
      }),
      { params: { id: createPayload.run.id } }
    );
    assert.equal(markdownResponse.status, 200);
    const markdownPayload = (await markdownResponse.json()) as { ok: boolean; markdown: string };
    assert.equal(markdownPayload.ok, true);
    assert.equal(markdownPayload.markdown.includes("Manual studio run"), true);

    await ensureUserDigestFeedToken(user.id);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("summary runs endpoint scrubs technical failure details into user-friendly copy", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-summary-errors`;

  const user = await prisma.user.create({
    data: {
      email: `summary-errors-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const session = await createSession(user.id);

    await prisma.summaryRun.create({
      data: {
        userId: user.id,
        requestedTitle: "Failed summary run",
        windowStart: new Date("2026-03-20T00:00:00.000Z"),
        windowEnd: new Date("2026-03-21T00:00:00.000Z"),
        status: "FAILED",
        targetLengthMinutes: 15,
        selectedItemCount: 2,
        podcastEnabled: true,
        podcastStatus: "FAILED",
        errorCode: "EXTRACTION_FAILED",
        errorMessage: "Azure OpenAI returned 400.",
        podcastError: "Azure OpenAI returned 400."
      }
    });

    const runsResponse = await summaryRunsGet(
      new NextRequest("http://localhost/api/summary/runs?limit=10", {
        headers: {
          cookie: `articlepod_session=${session}`
        }
      })
    );
    assert.equal(runsResponse.status, 200);

    const runsPayload = (await runsResponse.json()) as {
      ok: boolean;
      runs: Array<{ errorMessage: string | null; podcastError: string | null }>;
    };
    assert.equal(runsPayload.ok, true);
    assert.equal(runsPayload.runs[0]?.errorMessage, "We couldn't finish this summary right now. Please try again.");
    assert.equal(
      runsPayload.runs[0]?.podcastError,
      "The summary is ready, but we couldn't publish the audio version. Please try again."
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
