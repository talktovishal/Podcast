import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildUserItemMarkdownStorageKey, buildUserItemSummaryStorageKey } from "@articlepod/core";
import { NextRequest } from "next/server";
import { GET as processingModeGet, POST as processingModePost } from "../src/app/api/account/processing-mode/route";
import { POST as htmlSnapshotPost } from "../src/app/api/items/html-snapshot/route";
import { POST as requestTtsPost } from "../src/app/api/items/[id]/request-tts/route";
import { GET as itemSummaryGet } from "../src/app/api/items/[id]/summary/route";
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

test("processing mode setting makes new captures summary-only by default", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-summary-mode-default`;

  const user = await prisma.user.create({
    data: {
      email: `summary-mode-default-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const session = await createSession(user.id);
    const modeResponse = await processingModePost(
      new NextRequest("http://localhost/api/account/processing-mode", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `articlepod_session=${session}`
        },
        body: JSON.stringify({ mode: "SUMMARY_ONLY" })
      })
    );
    assert.equal(modeResponse.status, 200);

    const getResponse = await processingModeGet(
      new NextRequest("http://localhost/api/account/processing-mode", {
        headers: {
          cookie: `articlepod_session=${session}`
        }
      })
    );
    assert.equal(getResponse.status, 200);
    assert.equal(((await getResponse.json()) as { mode: string }).mode, "SUMMARY_ONLY");

    const captureResponse = await htmlSnapshotPost(
      new NextRequest("http://localhost/api/items/html-snapshot", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `articlepod_session=${session}`
        },
        body: JSON.stringify({
          url: `https://example.com/summary-mode/${uniq}`,
          title: `Summary mode ${uniq}`,
          html: `<html><body><article><h1>${uniq}</h1><p>summary mode default capture content</p></article></body></html>`,
          capturedAt: "2026-04-29T00:00:00.000Z"
        })
      })
    );
    assert.equal(captureResponse.status, 200);
    const capturePayload = (await captureResponse.json()) as { item_id: string };
    const item = await prisma.item.findUnique({
      where: { id: capturePayload.item_id },
      include: { jobs: true }
    });
    assert.equal(item?.processingMode, "SUMMARY_ONLY");
    assert.equal(item?.summaryStatus, "PROCESSING");
    assert.equal(item?.jobs[0]?.jobKind, "SUMMARY_ONLY");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("summary items expose markdown and can request full-article TTS later", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-request-tts`;
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `request-tts-${uniq}@articlepod.local`,
      role: "USER",
      isPaid: true,
      billingPlanCode: "PRO_MONTHLY",
      billingStatus: "ACTIVE",
      billingEntitlementStatus: "ACTIVE",
      billingLastPaymentStatus: "PAID",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const session = await createSession(user.id);
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        title: "Summary-first article",
        sourceType: "URL",
        sourceUrl: `https://example.com/request-tts/${uniq}`,
        status: "READY",
        processingMode: "SUMMARY_ONLY",
        summaryStatus: "SUCCEEDED",
        summaryTitle: "Summary-first article summary",
        summaryCompletedAt: new Date("2026-04-29T00:00:00.000Z")
      }
    });

    const markdownStored = await storage.putObject(
      buildUserItemMarkdownStorageKey(user.id, item.id),
      Buffer.from("# Summary-first article\n\nFull article body for later TTS.", "utf8"),
      { contentType: "text/markdown; charset=utf-8" }
    );
    await prisma.itemArtifact.create({
      data: {
        itemId: item.id,
        kind: "MARKDOWN",
        storageKey: markdownStored.key,
        contentType: "text/markdown; charset=utf-8",
        byteLength: markdownStored.bytes
      }
    });

    const summaryStored = await storage.putObject(
      buildUserItemSummaryStorageKey(user.id, item.id),
      Buffer.from("# Summary-first article summary\n\n- One concise point.", "utf8"),
      { contentType: "text/markdown; charset=utf-8" }
    );
    await prisma.item.update({
      where: { id: item.id },
      data: {
        summaryStorageKey: summaryStored.key,
        summaryBytes: summaryStored.bytes
      }
    });

    const summaryResponse = await itemSummaryGet(
      new NextRequest(`http://localhost/api/items/${item.id}/summary`, {
        headers: {
          cookie: `articlepod_session=${session}`
        }
      }),
      { params: { id: item.id } }
    );
    assert.equal(summaryResponse.status, 200);
    const summaryPayload = (await summaryResponse.json()) as { markdown: string; title: string };
    assert.match(summaryPayload.markdown, /One concise point/);
    assert.equal(summaryPayload.title, "Summary-first article summary");

    const requestResponse = await requestTtsPost(
      new NextRequest(`http://localhost/api/items/${item.id}/request-tts`, {
        method: "POST",
        headers: {
          cookie: `articlepod_session=${session}`
        }
      }),
      { params: { id: item.id } }
    );
    assert.equal(requestResponse.status, 200);
    const requestPayload = (await requestResponse.json()) as { ok: boolean; status: string; submission_quota: { remainingDailyPodcasts: number } };
    assert.equal(requestPayload.ok, true);
    assert.equal(requestPayload.status, "queued");
    assert.equal(requestPayload.submission_quota.remainingDailyPodcasts, 11);

    const [updatedItem, job] = await Promise.all([
      prisma.item.findUnique({ where: { id: item.id } }),
      prisma.job.findFirst({
        where: { itemId: item.id },
        orderBy: { createdAt: "desc" }
      })
    ]);
    assert.equal(updatedItem?.status, "QUEUED");
    assert.equal(updatedItem?.processingMode, "SUMMARY_ONLY");
    assert.equal(job?.jobKind, "REQUEST_TTS");
    assert.equal(job?.status, "QUEUED");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
