import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildUserItemMarkdownStorageKey,
  buildUserItemSummaryStorageKey,
} from "@articlepod/core";
import { NextRequest } from "next/server";
import {
  GET as processingModeGet,
  POST as processingModePost,
} from "../src/app/api/account/processing-mode/route";
import { POST as htmlSnapshotPost } from "../src/app/api/items/html-snapshot/route";
import { POST as retryPost } from "../src/app/api/items/[id]/retry/route";
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
  const result = spawnSync(
    "npx",
    ["pnpm", "--filter", "@articlepod/web", "run", "db:bootstrap"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

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
      ttsVoice: "af_heart",
    },
  });

  try {
    const session = await createSession(user.id);
    const modeResponse = await processingModePost(
      new NextRequest("http://localhost/api/account/processing-mode", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `articlepod_session=${session}`,
        },
        body: JSON.stringify({ mode: "SUMMARY_ONLY" }),
      }),
    );
    assert.equal(modeResponse.status, 200);

    const getResponse = await processingModeGet(
      new NextRequest("http://localhost/api/account/processing-mode", {
        headers: {
          cookie: `articlepod_session=${session}`,
        },
      }),
    );
    assert.equal(getResponse.status, 200);
    assert.equal(
      ((await getResponse.json()) as { mode: string }).mode,
      "SUMMARY_ONLY",
    );

    const captureResponse = await htmlSnapshotPost(
      new NextRequest("http://localhost/api/items/html-snapshot", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `articlepod_session=${session}`,
        },
        body: JSON.stringify({
          url: `https://example.com/summary-mode/${uniq}`,
          title: `Summary mode ${uniq}`,
          html: `<html><body><article><h1>${uniq}</h1><p>This summary mode capture has enough article text to be extracted and saved as canonical markdown before a separate summary task is queued.</p><p>The task should only represent the remaining summary generation work, not the source extraction stage.</p></article></body></html>`,
          capturedAt: "2026-04-29T00:00:00.000Z",
        }),
      }),
    );
    assert.equal(captureResponse.status, 200);
    const capturePayload = (await captureResponse.json()) as {
      item_id: string;
    };
    const item = await prisma.item.findUnique({
      where: { id: capturePayload.item_id },
      include: { jobs: true, articleSummaryTask: true },
    });
    assert.equal(item?.processingMode, "SUMMARY_ONLY");
    assert.equal(item?.summaryStatus, "PROCESSING");
    assert.equal(item?.jobs.length, 0);
    assert.equal(item?.articleSummaryTask?.status, "QUEUED");
    assert.equal(item?.articleSummaryTask?.userId, user.id);
    assert.match(item?.title || "", new RegExp(uniq));
    const markdownArtifact = await prisma.itemArtifact.findUnique({
      where: {
        itemId_kind: {
          itemId: capturePayload.item_id,
          kind: "MARKDOWN",
        },
      },
    });
    assert.ok(markdownArtifact);
    assert.ok(markdownArtifact.byteLength > 0);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("full-episode captures still enqueue podcast jobs and dispatch messages", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-full-mode-default`;

  const user = await prisma.user.create({
    data: {
      email: `full-mode-default-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart",
    },
  });

  try {
    const session = await createSession(user.id);
    const captureResponse = await htmlSnapshotPost(
      new NextRequest("http://localhost/api/items/html-snapshot", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `articlepod_session=${session}`,
        },
        body: JSON.stringify({
          url: `https://example.com/full-mode/${uniq}`,
          title: `Full mode ${uniq}`,
          html: `<html><body><article><h1>${uniq}</h1><p>full episode capture content</p></article></body></html>`,
          capturedAt: "2026-04-29T00:00:00.000Z",
        }),
      }),
    );
    assert.equal(captureResponse.status, 200);
    const capturePayload = (await captureResponse.json()) as {
      item_id: string;
    };
    const item = await prisma.item.findUnique({
      where: { id: capturePayload.item_id },
      include: { jobs: true, articleSummaryTask: true },
    });
    assert.equal(item?.processingMode, "FULL_EPISODE");
    assert.equal(item?.summaryStatus, "NOT_REQUESTED");
    assert.equal(item?.articleSummaryTask, null);
    assert.equal(item?.jobs.length, 1);
    assert.equal(item?.jobs[0]?.jobKind, "FULL_EPISODE");

    const dispatchMessage = await prisma.dispatchQueueMessage.findFirst({
      where: { jobId: item?.jobs[0]?.id },
    });
    assert.ok(dispatchMessage);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("summary-mode azure primary submission creates an article summary task without a job", () => {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const repoRoot = resolve(here, "../../..");
  const itemsModuleUrl = pathToFileURL(
    resolve(repoRoot, "apps/web/src/lib/items.ts"),
  ).href;
  const metadataModuleUrl = pathToFileURL(
    resolve(repoRoot, "apps/web/src/lib/metadata-primary-store.ts"),
  ).href;
  const script = `
    delete process.env.DATABASE_URL;
    process.env.RUNTIME_PROFILE = "azure";
    process.env.METADATA_PRIMARY_BACKEND = "azure_table";
    process.env.AZURE_TABLE_CONNECTION_STRING = "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=ZmFrZQ==;EndpointSuffix=core.windows.net";
    process.env.AZURE_TABLE_CREATE_TABLES = "0";
    process.env.STORAGE_BACKEND = "local";
    process.env.STORAGE_ROOT = ".data/media";
    process.env.MEDIA_SIGNING_KEY = "12345678901234567890123456789012";
    process.env.DIGEST_SCHEDULER_SECRET = "12345678901234567890123456789012";
    process.env.ANALYTICS_STORAGE_MODE = "off";
    (async () => {
      const metadataModule = await import(${JSON.stringify(metadataModuleUrl)});
      const store = metadataModule.webPrimaryStore;
      const now = new Date("2026-04-30T09:00:00.000Z");
      const calls = { items: [], articleSummaryTasks: [], jobs: [], artifacts: [], itemUpdates: [] };
      let user = {
        id: "azure-summary-user",
        email: "azure-summary-user@articlepod.local",
        passwordHash: null,
        name: null,
        role: "USER",
        billingLanePreference: "LIVE",
        complimentaryPro: false,
        billingProvider: null,
        billingCustomerId: null,
        billingSubscriptionId: null,
        billingPriceId: null,
        billingPlanCode: "STARTER",
        billingStatus: "NONE",
        billingEntitlementStatus: "INACTIVE",
        billingLastPaymentStatus: "NONE",
        billingLastInvoiceId: null,
        billingCurrentPeriodEnd: null,
        billingCancelAtPeriodEnd: false,
        billingLastStripeEventId: null,
        billingLastStripeEventCreatedAt: null,
        billingLastSubscriptionEventAt: null,
        billingLastInvoiceEventAt: null,
        billingUpdatedAt: null,
        isPaid: false,
        submissionCount: 0,
        extraSubmissionCredits: 0,
        defaultItemProcessingMode: "SUMMARY_ONLY",
        ttsProvider: "kokoro",
        ttsVoice: "af_heart",
        firstSeenAt: null,
        firstSeenCountryCode: null,
        firstSeenRegionCode: null,
        firstSeenCity: null,
        lastSeenAt: null,
        lastSeenCountryCode: null,
        lastSeenRegionCode: null,
        lastSeenCity: null,
        createdAt: now,
        updatedAt: now
      };
      Object.assign(store, {
        findUserById: async () => user,
        updateUser: async (_id, patch) => {
          user = { ...user, ...patch, updatedAt: now };
          return user;
        },
        findSandboxBillingAccountByUserId: async () => null,
        listArticleSummaryTasksByUser: async () => [],
        listJobsByUser: async () => [],
        listItemsByUser: async () => [],
        listOAuthIdentitiesByUser: async () => [],
        createItem: async (input) => {
          calls.items.push(input);
          return {
            id: input.id,
            userId: input.userId,
            title: input.title ?? null,
            sourceType: input.sourceType,
            sourceUrl: input.sourceUrl ?? null,
            sourceFilePath: input.sourceFilePath ?? null,
            sourceHtml: input.sourceHtml ?? null,
            sourceCapturedAt: input.sourceCapturedAt ?? null,
            status: input.status,
            processingMode: input.processingMode,
            priority: input.priority ?? "LOW",
            tags: input.tags ?? [],
            errorCode: input.errorCode ?? null,
            errorMessage: input.errorMessage ?? null,
            textHash: null,
            summaryStatus: input.summaryStatus,
            summaryTitle: null,
            summaryStorageKey: null,
            summaryBytes: null,
            summaryProvider: null,
            summaryModel: null,
            summaryDeployment: null,
            summaryInputTokens: null,
            summaryOutputTokens: null,
            summaryErrorCode: null,
            summaryErrorMessage: null,
            summaryCompletedAt: null,
            extractionEngine: null,
            extractionSelectionMode: null,
            extractionScoreMargin: null,
            extractionSummaryJson: null,
            extractionSelectionRecordedAt: null,
            createdAt: now,
            updatedAt: now
          };
        },
        upsertItemArtifact: async (input) => {
          calls.artifacts.push(input);
          return {
            id: input.id,
            itemId: input.itemId,
            kind: input.kind,
            storageKey: input.storageKey,
            contentType: input.contentType,
            byteLength: input.byteLength,
            expiresAt: input.expiresAt ?? null,
            createdAt: now
          };
        },
        updateItem: async (_id, patch) => {
          calls.itemUpdates.push(patch);
          return {
            ...calls.items[0],
            ...patch,
            id: calls.items[0].id,
            userId: calls.items[0].userId,
            createdAt: now,
            updatedAt: now
          };
        },
        createArticleSummaryTask: async (input) => {
          calls.articleSummaryTasks.push(input);
          return {
            id: input.id,
            itemId: input.itemId,
            userId: input.userId,
            status: input.status ?? "QUEUED",
            attempt: input.attempt ?? 0,
            scheduledFor: input.scheduledFor ?? null,
            nextRetryAt: input.nextRetryAt ?? null,
            lockedAt: input.lockedAt ?? null,
            leaseId: input.leaseId ?? null,
            leaseOwner: input.leaseOwner ?? null,
            errorCode: input.errorCode ?? null,
            errorMessage: input.errorMessage ?? null,
            createdAt: now,
            updatedAt: now
          };
        },
        createJob: async (input) => {
          calls.jobs.push(input);
          throw new Error("summary mode should not create jobs");
        }
      });
      const itemsModule = await import(${JSON.stringify(itemsModuleUrl)});
      const result = await itemsModule.enqueueItem({
        userId: user.id,
        title: "Azure summary task",
        mode: "summary",
        sourceType: "HTML_SNAPSHOT",
        sourceUrl: "https://example.com/azure-summary",
        sourceHtml: "<article><h1>Azure summary source</h1><p>This captured article contains enough stable text to create canonical markdown before the summary task is queued.</p><p>Only summary generation should remain pending after this call finishes.</p></article>",
        sourceCapturedAt: now
      });
      console.log(JSON.stringify({
        itemProcessingMode: result.item.processingMode,
        itemSummaryStatus: result.item.summaryStatus,
        itemCount: calls.items.length,
        artifactCount: calls.artifacts.length,
        updateCount: calls.itemUpdates.length,
        taskCount: calls.articleSummaryTasks.length,
        jobCount: calls.jobs.length,
        taskItemId: calls.articleSummaryTasks[0]?.itemId,
        taskUserId: calls.articleSummaryTasks[0]?.userId
      }));
    })().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;

  const result = spawnSync("npx", ["tsx", "--eval", script], {
    cwd: resolve(repoRoot, "apps/web"),
    encoding: "utf8",
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(
      result.stderr ||
        result.stdout ||
        "azure summary-mode enqueue script failed",
    );
  }

  const payload = JSON.parse(result.stdout.trim()) as {
    itemProcessingMode: string;
    itemSummaryStatus: string;
    itemCount: number;
    artifactCount: number;
    updateCount: number;
    taskCount: number;
    jobCount: number;
    taskItemId: string;
    taskUserId: string;
  };
  assert.equal(payload.itemProcessingMode, "SUMMARY_ONLY");
  assert.equal(payload.itemSummaryStatus, "PROCESSING");
  assert.equal(payload.itemCount, 1);
  assert.equal(payload.artifactCount, 2);
  assert.equal(payload.updateCount, 1);
  assert.equal(payload.taskCount, 1);
  assert.equal(payload.jobCount, 0);
  assert.ok(payload.taskItemId);
  assert.equal(payload.taskUserId, "azure-summary-user");
});

test("summary-mode retry rebuilds markdown and requeues article summary task without a job", async () => {
  ensureDbBootstrap();
  const uniq = `${Date.now().toString(36)}-summary-retry`;

  const user = await prisma.user.create({
    data: {
      email: `summary-retry-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart",
    },
  });

  try {
    const session = await createSession(user.id);
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        title: null,
        sourceType: "HTML_SNAPSHOT",
        sourceUrl: `https://example.com/summary-retry/${uniq}`,
        sourceHtml: `<html><body><article><h1>Retried summary ${uniq}</h1><p>This retry fixture contains enough article text to rebuild the canonical markdown artifact before a summary task is queued again.</p><p>The retry endpoint must not create a podcast job or dispatch message for a summary-only item.</p></article></body></html>`,
        status: "FAILED",
        processingMode: "SUMMARY_ONLY",
        summaryStatus: "FAILED",
        errorCode: "EXTRACTION_FAILED",
        errorMessage: "Previous failure",
        summaryErrorCode: "EXTRACTION_FAILED",
        summaryErrorMessage: "Previous failure",
      },
    });

    const response = await retryPost(
      new NextRequest(`http://localhost/api/items/${item.id}/retry`, {
        method: "POST",
        headers: {
          cookie: `articlepod_session=${session}`,
        },
      }),
      { params: { id: item.id } },
    );
    assert.equal(response.status, 200);

    const updated = await prisma.item.findUnique({
      where: { id: item.id },
      include: {
        jobs: true,
        articleSummaryTask: true,
        artifacts: {
          where: { kind: "MARKDOWN" },
        },
      },
    });
    assert.equal(updated?.status, "QUEUED");
    assert.equal(updated?.summaryStatus, "PROCESSING");
    assert.equal(updated?.jobs.length, 0);
    assert.equal(updated?.articleSummaryTask?.status, "QUEUED");
    assert.equal(updated?.artifacts.length, 1);
    assert.match(updated?.title || "", /Retried summary/);
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
      ttsVoice: "af_heart",
    },
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
        summaryCompletedAt: new Date("2026-04-29T00:00:00.000Z"),
      },
    });

    const markdownStored = await storage.putObject(
      buildUserItemMarkdownStorageKey(user.id, item.id),
      Buffer.from(
        "# Summary-first article\n\nFull article body for later TTS.",
        "utf8",
      ),
      { contentType: "text/markdown; charset=utf-8" },
    );
    await prisma.itemArtifact.create({
      data: {
        itemId: item.id,
        kind: "MARKDOWN",
        storageKey: markdownStored.key,
        contentType: "text/markdown; charset=utf-8",
        byteLength: markdownStored.bytes,
      },
    });

    const summaryStored = await storage.putObject(
      buildUserItemSummaryStorageKey(user.id, item.id),
      Buffer.from(
        "# Summary-first article summary\n\n- One concise point.",
        "utf8",
      ),
      { contentType: "text/markdown; charset=utf-8" },
    );
    await prisma.item.update({
      where: { id: item.id },
      data: {
        summaryStorageKey: summaryStored.key,
        summaryBytes: summaryStored.bytes,
      },
    });

    const summaryResponse = await itemSummaryGet(
      new NextRequest(`http://localhost/api/items/${item.id}/summary`, {
        headers: {
          cookie: `articlepod_session=${session}`,
        },
      }),
      { params: { id: item.id } },
    );
    assert.equal(summaryResponse.status, 200);
    const summaryPayload = (await summaryResponse.json()) as {
      markdown: string;
      title: string;
    };
    assert.match(summaryPayload.markdown, /One concise point/);
    assert.equal(summaryPayload.title, "Summary-first article summary");

    const requestResponse = await requestTtsPost(
      new NextRequest(`http://localhost/api/items/${item.id}/request-tts`, {
        method: "POST",
        headers: {
          cookie: `articlepod_session=${session}`,
        },
      }),
      { params: { id: item.id } },
    );
    assert.equal(requestResponse.status, 200);
    const requestPayload = (await requestResponse.json()) as {
      ok: boolean;
      status: string;
      submission_quota: { remainingDailyPodcasts: number };
    };
    assert.equal(requestPayload.ok, true);
    assert.equal(requestPayload.status, "queued");
    assert.equal(requestPayload.submission_quota.remainingDailyPodcasts, 11);

    const [updatedItem, job] = await Promise.all([
      prisma.item.findUnique({ where: { id: item.id } }),
      prisma.job.findFirst({
        where: { itemId: item.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    assert.equal(updatedItem?.status, "QUEUED");
    assert.equal(updatedItem?.processingMode, "SUMMARY_ONLY");
    assert.equal(job?.jobKind, "REQUEST_TTS");
    assert.equal(job?.status, "QUEUED");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
