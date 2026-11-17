import assert from "node:assert/strict";
import test from "node:test";
import {
  AppError, errorCodes, type AzureTablePrimaryItem,
  type AzureTablePrimaryJob, type AzureTablePrimaryArticleSummaryTask
} from "@articlepod/core";

// Node's test runner isolates this file; set the backend before loading worker singletons.
Object.assign(process.env, {
  METADATA_PRIMARY_BACKEND: "azure_table",
  AZURE_TABLE_CONNECTION_STRING: "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=ZmFrZQ==;EndpointSuffix=core.windows.net",
  AZURE_TABLE_CREATE_TABLES: "0",
  METADATA_MIRROR_BACKEND: "none",
  METADATA_MIRROR_DUAL_WRITE: "0",
  ANALYTICS_STORAGE_MODE: "off",
  JOB_EVENT_STORAGE_MODE: "off",
  DEMO_EXTRACTION_TRACE_ENABLED: "0",
  STORAGE_BACKEND: "local",
  ITEM_DISPATCH_BACKEND: "prisma",
  DIGEST_SUMMARY_PROVIDER: "stub"
});

const { workerPrimaryStore } = await import("../src/lib/metadata-primary-store.js");
const { getArtifactStorage } = await import("../src/lib/storage.js");
const { processJob } = await import("../src/jobs/processItemJob.js");
const { processArticleSummaryTask } = await import("../src/jobs/processArticleSummaryTask.js");

const markdown = `# Queue fixture

This fixture provides enough deterministic text for extraction and chunking in worker queue tests.
It validates publication state, rejected concurrent updates, and retry scheduling without contacting a model.
The text is intentionally stable so these tests can exercise a cached audio publication safely.
`;
const html = `<html><head><title>Queue fixture</title></head><body><article>
<h1>Queue fixture</h1><p>${markdown.replace("# Queue fixture", "")}</p>
</article></body></html>`;

for (const mode of ["FULL_EPISODE", "SUMMARY_ONLY", "ARTICLE_TASK"] as const) {
  for (const outcome of ["success", "conflict", "missing", "persistent-conflict"] as const) {
    test(`${mode} cannot complete an unapplied item update (${outcome})`, async (t) => {
      assert.ok(workerPrimaryStore);
      const store = workerPrimaryStore;
      const date = new Date();
      let row: AzureTablePrimaryItem = {
        id: "item", userId: "user", title: "Queue fixture",
        sourceType: "HTML_SNAPSHOT", sourceHtml: html, sourceUrl: "https://example.com/fixture",
        processingMode: mode === "FULL_EPISODE" ? "FULL_EPISODE" : "SUMMARY_ONLY",
        status: "QUEUED", createdAt: date, updatedAt: date,
        sourceFilePath: null, sourceCapturedAt: date, priority: "LOW", tags: [],
        errorCode: null, errorMessage: null, textHash: null,
        summaryStatus: "NOT_REQUESTED", summaryTitle: null, summaryStorageKey: null, summaryBytes: null,
        summaryProvider: null, summaryModel: null, summaryDeployment: null, summaryInputTokens: null,
        summaryOutputTokens: null, summaryErrorCode: null, summaryErrorMessage: null, summaryCompletedAt: null,
        extractionEngine: null, extractionSelectionMode: null, extractionScoreMargin: null,
        extractionSummaryJson: null, extractionSelectionRecordedAt: null
      };
      let deleted = false;
      let readyWrites = 0;
      const states: string[] = [];
      const missing = () => new AppError(errorCodes.ITEM_NOT_FOUND, "This item no longer exists.", 404);
      const conflict = () => new AppError(errorCodes.ITEM_UPDATE_CONFLICT, "Item changed. Please retry.", 409);
      t.mock.method(store, "findItemById", async () => deleted ? null : { ...row });
      t.mock.method(store, "updateItem", async (
        _id: string, patch: Parameters<typeof store.updateItem>[1]
      ) => {
        if (deleted) throw missing();
        if (patch.status === "READY") {
          readyWrites++;
          if (outcome === "missing") {
            deleted = true;
            throw missing();
          }
          if (outcome !== "success") throw conflict();
        }
        if (outcome === "persistent-conflict" && readyWrites > 0) throw conflict();
        row = { ...row, ...patch };
        return row;
      });
      t.mock.method(store, "upsertItemArtifact", async (input: Parameters<typeof store.upsertItemArtifact>[0]) => ({
        ...input, expiresAt: input.expiresAt ?? null, createdAt: input.createdAt ?? date
      }));
      const episodeWrite = t.mock.method(store, "upsertEpisode", async (input: Parameters<typeof store.upsertEpisode>[0]) => ({
        ...input, expiresAt: input.expiresAt ?? null, createdAt: input.createdAt ?? date
      }));

      let task: AzureTablePrimaryArticleSummaryTask = {
        id: "task", itemId: "item", userId: "user", status: "QUEUED", attempt: 0,
        scheduledFor: null, nextRetryAt: null, lockedAt: null, leaseId: null, leaseOwner: null,
        errorCode: null, errorMessage: null, createdAt: date, updatedAt: date
      };
      let job: AzureTablePrimaryJob = {
        ...task, id: "job", jobKind: mode === "FULL_EPISODE" ? "FULL_EPISODE" : "SUMMARY_ONLY",
        leaseExpiresAt: null, lastHeartbeatAt: null, dispatchMessageId: null
      };
      t.mock.method(store, "findUserById", async () => null);
      t.mock.method(store, "claimJob", async (input: Parameters<typeof store.claimJob>[0]) => {
        job = {
          ...job, status: "PROCESSING", attempt: 1, lockedAt: input.now,
          leaseId: input.leaseId, leaseOwner: input.leaseOwner, leaseExpiresAt: input.leaseExpiresAt
        };
        return job;
      });
      t.mock.method(store, "updateJobIfLeaseMatches", async (
        _id: string, leaseId: string, patch: Parameters<typeof store.updateJobIfLeaseMatches>[2]
      ) => {
        if (job.leaseId !== leaseId) return null;
        if (patch.status) states.push(patch.status);
        job = { ...job, ...patch, leaseId: patch.clearLease ? null : job.leaseId };
        return job;
      });
      t.mock.method(store, "findArticleSummaryTaskById", async () => task);
      t.mock.method(store, "updateArticleSummaryTask", async (
        _id: string, patch: Parameters<typeof store.updateArticleSummaryTask>[1]
      ) => {
        if (patch.status) states.push(patch.status);
        task = { ...task, ...patch };
        return task;
      });
      const finishTask = t.mock.method(store, "deleteArticleSummaryTask", async () => {});
      t.mock.method(store, "listItemArtifacts", async () => [{
        id: "markdown", itemId: "item", kind: "MARKDOWN", storageKey: "canonical.md",
        contentType: "text/markdown", byteLength: Buffer.byteLength(markdown), expiresAt: null, createdAt: date
      }]);
      t.mock.method(store, "findChunkCacheByHash", async (hash: string) => ({
        hash, itemId: "item", chunkIndex: 0, filePath: "cached.mp3",
        audioBytes: 128, mimeType: "audio/mpeg", createdAt: date
      }));

      const objects = new Map<string, Buffer>([
        ["canonical.md", Buffer.from(markdown)], ["cached.mp3", Buffer.alloc(128)]
      ]);
      const storage = getArtifactStorage();
      t.mock.method(storage, "getObject", async (key: string) => {
        const bytes = objects.get(key);
        assert.ok(bytes, `Unexpected object read: ${key}`);
        return bytes;
      });
      t.mock.method(storage, "putObject", async (key: string, bytes: Buffer) => {
        objects.set(key, Buffer.from(bytes));
        return { key, bytes: bytes.length };
      });
      t.mock.method(storage, "headObject", async (key: string) => {
        const bytes = objects.get(key);
        assert.ok(bytes, `Unexpected object HEAD: ${key}`);
        return { key, bytes: bytes.length, contentType: "audio/mpeg" };
      });

      const run = () => mode === "ARTICLE_TASK" ? processArticleSummaryTask("task") : processJob("job");
      if (mode === "ARTICLE_TASK" && (outcome === "missing" || outcome === "persistent-conflict")) {
        await assert.rejects(run(), (error) => {
          assert.ok(error instanceof AppError);
          assert.equal(error.code, outcome === "missing" ? errorCodes.ITEM_NOT_FOUND : errorCodes.ITEM_UPDATE_CONFLICT);
          return true;
        });
      } else {
        assert.equal(await run(), outcome === "success");
      }
      assert.equal(readyWrites, 1, "must reach the completion boundary and never blindly retry its write");
      assert.equal(episodeWrite.mock.callCount(), mode === "FULL_EPISODE" ? 1 : 0);
      if (outcome === "success") {
        assert.equal(row.status, "READY");
        if (mode === "ARTICLE_TASK") assert.equal(finishTask.mock.callCount(), 1);
        else assert.equal(job.status, "SUCCEEDED");
      } else {
        assert.ok(!states.includes("SUCCEEDED"));
        assert.equal(finishTask.mock.callCount(), 0);
        const work = mode === "ARTICLE_TASK" ? task : job;
        assert.equal(work.status, "FAILED");
        assert.equal(work.errorCode, outcome === "missing" ? errorCodes.ITEM_NOT_FOUND : errorCodes.ITEM_UPDATE_CONFLICT);
        assert.equal(work.nextRetryAt instanceof Date, outcome !== "missing");
        assert.notEqual(row.status, "READY");
      }
    });
  }
}
