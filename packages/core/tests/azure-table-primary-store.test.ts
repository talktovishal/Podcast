import assert from "node:assert/strict";
import test from "node:test";
import { AzureTablePrimaryStore } from "../src/metadata/azureTablePrimaryStore";

function createStore(): AzureTablePrimaryStore {
  return new AzureTablePrimaryStore({
    tablePrefix: "articlepod",
    connectionString: "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=ZmFrZQ==;EndpointSuffix=core.windows.net",
    createTablesIfMissing: false
  });
}

test("listPendingDigestSchedulerTicks filters null processedAt client-side", async () => {
  const store = createStore();
  let seenFilter: string | undefined;

  (store as unknown as { listEntities: (key: string, filter?: string) => Promise<Array<Record<string, unknown>>> }).listEntities =
    async (_key, filter) => {
      seenFilter = filter;
      return [
        {
          partitionKey: "digestTick",
          rowKey: "tick-pending",
          requestedAt: "2026-03-24T08:00:00.000Z",
          requestedBy: "ops",
          forceNow: true
        },
        {
          partitionKey: "digestTick",
          rowKey: "tick-processed",
          requestedAt: "2026-03-24T07:00:00.000Z",
          requestedBy: "ops",
          forceNow: false,
          processedAt: "2026-03-24T07:30:00.000Z"
        }
      ];
    };

  const ticks = await store.listPendingDigestSchedulerTicks(5);

  assert.equal(seenFilter, "PartitionKey eq 'digestTick'");
  assert.deepEqual(
    ticks.map((tick) => tick.id),
    ["tick-pending"]
  );
});

test("revokeExtensionTokensForUser filters null revokedAt client-side", async () => {
  const store = createStore();
  let seenFilter: string | undefined;
  const updatedRowKeys: string[] = [];

  (store as unknown as { listEntities: (key: string, filter?: string) => Promise<Array<Record<string, unknown>>> }).listEntities =
    async (_key, filter) => {
      seenFilter = filter;
      return [
        {
          partitionKey: "extToken",
          rowKey: "active-token",
          id: "active-token",
          userId: "user-1",
          tokenHash: "hash-1",
          createdAt: "2026-03-24T08:00:00.000Z"
        },
        {
          partitionKey: "extToken",
          rowKey: "revoked-token",
          id: "revoked-token",
          userId: "user-1",
          tokenHash: "hash-2",
          revokedAt: "2026-03-24T08:10:00.000Z",
          createdAt: "2026-03-24T08:00:00.000Z"
        }
      ];
    };

  (
    store as unknown as {
      updateEntity: (key: string, entity: Record<string, unknown>, etag?: string) => Promise<boolean>;
    }
  ).updateEntity = async (_key, entity) => {
    updatedRowKeys.push(String(entity.rowKey));
    return true;
  };

  const updatedCount = await store.revokeExtensionTokensForUser("user-1", new Date("2026-03-24T09:00:00.000Z"));

  assert.equal(seenFilter, "(PartitionKey eq 'extToken') and (userId eq 'user-1')");
  assert.equal(updatedCount, 1);
  assert.deepEqual(updatedRowKeys, ["active-token"]);
});

test("createItem stores tagsJson and returns tags", async () => {
  const store = createStore();
  let createdEntity: Record<string, unknown> | undefined;

  (
    store as unknown as {
      createEntity: (key: string, entity: Record<string, unknown>) => Promise<void>;
    }
  ).createEntity = async (_key, entity) => {
    createdEntity = entity;
  };

  const item = await store.createItem({
    id: "item-1",
    userId: "user-1",
    sourceType: "URL",
    status: "QUEUED",
    priority: "HIGH",
    tags: ["financial", "retirement"],
    extractionEngine: "defuddle",
    extractionSelectionMode: "scored",
    extractionScoreMargin: 1.75,
    extractionSummaryJson: '{"version":1}',
    extractionSelectionRecordedAt: new Date("2026-04-08T18:00:00.000Z")
  });

  assert.equal(createdEntity?.priority, "HIGH");
  assert.equal(createdEntity?.tagsJson, '["financial","retirement"]');
  assert.equal(createdEntity?.extractionEngine, "defuddle");
  assert.equal(createdEntity?.extractionSelectionMode, "scored");
  assert.equal(createdEntity?.extractionScoreMargin, 1.75);
  assert.equal(createdEntity?.extractionSummaryJson, '{"version":1}');
  assert.equal(createdEntity?.extractionSelectionRecordedAt, "2026-04-08T18:00:00.000Z");
  assert.deepEqual(item.tags, ["financial", "retirement"]);
  assert.equal(item.extractionEngine, "defuddle");
  assert.equal(item.extractionSelectionMode, "scored");
  assert.equal(item.extractionScoreMargin, 1.75);
  assert.equal(item.extractionSummaryJson, '{"version":1}');
  assert.equal(item.extractionSelectionRecordedAt?.toISOString(), "2026-04-08T18:00:00.000Z");
});

test("findItemById defaults missing tagsJson to empty tags", async () => {
  const store = createStore();

  (
    store as unknown as {
      getEntity: (key: string, partitionKey: string, rowKey: string) => Promise<Record<string, unknown> | null>;
    }
  ).getEntity = async () => ({
    partitionKey: "item",
    rowKey: "item-2",
    userId: "user-2",
    sourceType: "URL",
    status: "READY",
    priority: "MEDIUM",
    createdAt: "2026-03-25T09:00:00.000Z",
    updatedAt: "2026-03-25T09:00:00.000Z"
  });

  const item = await store.findItemById("item-2");

  assert.ok(item);
  assert.equal(item?.priority, "MEDIUM");
  assert.deepEqual(item?.tags, []);
});

test("updateItem writes serialized tagsJson when tags change", async () => {
  const store = createStore();
  let updatedEntity: Record<string, unknown> | undefined;

  (
    store as unknown as {
      getEntity: (key: string, partitionKey: string, rowKey: string) => Promise<Record<string, unknown> | null>;
    }
  ).getEntity = async () => ({
    partitionKey: "item",
    rowKey: "item-3",
    userId: "user-3",
    sourceType: "PDF",
    status: "QUEUED",
    priority: "LOW",
    tagsJson: '["personal"]',
    extractionEngine: "readability",
    extractionSelectionMode: "readability_only",
    extractionScoreMargin: 0,
    extractionSummaryJson: '{"version":1,"selectedEngine":"readability"}',
    extractionSelectionRecordedAt: "2026-03-25T09:15:00.000Z",
    createdAt: "2026-03-25T09:00:00.000Z",
    updatedAt: "2026-03-25T09:00:00.000Z",
    etag: "etag-1"
  });

  (
    store as unknown as {
      updateEntity: (key: string, entity: Record<string, unknown>, etag?: string) => Promise<boolean>;
    }
  ).updateEntity = async (_key, entity) => {
    updatedEntity = entity;
    return true;
  };

  const item = await store.updateItem("item-3", {
    priority: "HIGH",
    tags: ["financial", "retirement"],
    extractionEngine: "defuddle",
    extractionSelectionMode: "scored",
    extractionScoreMargin: 2.25,
    extractionSummaryJson: '{"version":1,"selectedEngine":"defuddle"}',
    extractionSelectionRecordedAt: new Date("2026-03-25T09:45:00.000Z")
  });

  assert.equal(updatedEntity?.priority, "HIGH");
  assert.equal(updatedEntity?.tagsJson, '["financial","retirement"]');
  assert.equal(updatedEntity?.extractionEngine, "defuddle");
  assert.equal(updatedEntity?.extractionSelectionMode, "scored");
  assert.equal(updatedEntity?.extractionScoreMargin, 2.25);
  assert.equal(updatedEntity?.extractionSummaryJson, '{"version":1,"selectedEngine":"defuddle"}');
  assert.equal(updatedEntity?.extractionSelectionRecordedAt, "2026-03-25T09:45:00.000Z");
  assert.deepEqual(item?.tags, ["financial", "retirement"]);
  assert.equal(item?.extractionEngine, "defuddle");
  assert.equal(item?.extractionSelectionMode, "scored");
  assert.equal(item?.extractionScoreMargin, 2.25);
  assert.equal(item?.extractionSummaryJson, '{"version":1,"selectedEngine":"defuddle"}');
  assert.equal(item?.extractionSelectionRecordedAt?.toISOString(), "2026-03-25T09:45:00.000Z");
});

test("article summary task store creates and lists eligible work across users", async () => {
  const store = createStore();
  const createdEntities: Record<string, unknown>[] = [];
  let seenFilters: string[] = [];

  (
    store as unknown as {
      createEntity: (key: string, entity: Record<string, unknown>) => Promise<void>;
    }
  ).createEntity = async (_key, entity) => {
    createdEntities.push(entity);
  };

  const created = await store.createArticleSummaryTask({
    id: "task-created",
    itemId: "item-created",
    userId: "user-created",
    scheduledFor: new Date("2026-04-30T09:00:00.000Z")
  });

  assert.equal(createdEntities[0]?.partitionKey, "articleSummaryTask");
  assert.equal(createdEntities[0]?.rowKey, "task-created");
  assert.equal(createdEntities[0]?.itemId, "item-created");
  assert.equal(createdEntities[0]?.status, "QUEUED");
  assert.equal(created.status, "QUEUED");
  assert.equal(created.scheduledFor?.toISOString(), "2026-04-30T09:00:00.000Z");

  (
    store as unknown as {
      listEntities: (key: string, filter?: string) => Promise<Array<Record<string, unknown>>>;
    }
  ).listEntities = async (_key, filter) => {
    seenFilters.push(filter || "");
    if (String(filter).includes("status eq 'QUEUED'")) {
      return [
        {
          partitionKey: "articleSummaryTask",
          rowKey: "task-queued-ready",
          itemId: "item-1",
          userId: "user-1",
          status: "QUEUED",
          attempt: 0,
          scheduledFor: "2026-04-30T08:59:00.000Z",
          createdAt: "2026-04-30T08:00:00.000Z",
          updatedAt: "2026-04-30T08:00:00.000Z"
        },
        {
          partitionKey: "articleSummaryTask",
          rowKey: "task-queued-future",
          itemId: "item-2",
          userId: "user-2",
          status: "QUEUED",
          attempt: 0,
          scheduledFor: "2026-04-30T10:00:00.000Z",
          createdAt: "2026-04-30T08:05:00.000Z",
          updatedAt: "2026-04-30T08:05:00.000Z"
        }
      ];
    }
    return [
      {
        partitionKey: "articleSummaryTask",
        rowKey: "task-failed-ready",
        itemId: "item-3",
        userId: "user-3",
        status: "FAILED",
        attempt: 1,
        nextRetryAt: "2026-04-30T08:30:00.000Z",
        createdAt: "2026-04-30T07:30:00.000Z",
        updatedAt: "2026-04-30T08:30:00.000Z"
      }
    ];
  };

  const eligible = await store.listNextEligibleArticleSummaryTasks(new Date("2026-04-30T09:00:00.000Z"), 3);

  assert.deepEqual(
    eligible.map((task) => task.id),
    ["task-failed-ready", "task-queued-ready"]
  );
  assert.equal(seenFilters.length, 2);
  assert.equal(seenFilters[0], "(PartitionKey eq 'articleSummaryTask') and (status eq 'QUEUED')");
  assert.equal(
    seenFilters[1],
    "(PartitionKey eq 'articleSummaryTask') and (status eq 'FAILED') and (attempt lt 3) and (nextRetryAt le '2026-04-30T09:00:00.000Z')"
  );
});

test("createSnippet stores rich snippet capture fields alongside selected text", async () => {
  const store = createStore();
  let createdEntity: Record<string, unknown> | undefined;

  (
    store as unknown as {
      createEntity: (key: string, entity: Record<string, unknown>) => Promise<void>;
    }
  ).createEntity = async (_key, entity) => {
    createdEntity = entity;
  };

  const snippet = await store.createSnippet({
    id: "snippet-1",
    userId: "user-1",
    sourceUrl: "https://example.com/article",
    sourceTitle: "Example",
    selectedText: "Saved excerpt",
    selectedHtml: "<p>Saved <strong>excerpt</strong></p>",
    selectionMarkdown: "Saved **excerpt**",
    contextMarkdown: "## Context\n\nSaved **excerpt** with more detail.",
    captureMarkdown: "# Example\n\n## Selected passage\n\nSaved **excerpt**",
    pageMetadata: {
      siteName: "Example Site",
      sectionHeadings: ["Main topic", "Details"]
    },
    comment: "Follow up later"
  });

  assert.equal(createdEntity?.selectedText, "Saved excerpt");
  assert.equal(createdEntity?.selectedHtml, "<p>Saved <strong>excerpt</strong></p>");
  assert.equal(createdEntity?.selectionMarkdown, "Saved **excerpt**");
  assert.equal(createdEntity?.contextMarkdown, "## Context\n\nSaved **excerpt** with more detail.");
  assert.equal(createdEntity?.captureMarkdown, "# Example\n\n## Selected passage\n\nSaved **excerpt**");
  assert.deepEqual(JSON.parse(String(createdEntity?.pageMetadataJson)), {
    sectionHeadings: ["Main topic", "Details"],
    siteName: "Example Site"
  });
  assert.equal(createdEntity?.comment, "Follow up later");
  assert.equal(snippet.sourceUrl, "https://example.com/article");
  assert.equal(snippet.pageMetadata?.siteName, "Example Site");
  assert.equal(snippet.comment, "Follow up later");
});

test("createFeedback stores admin inbox and mirror metadata", async () => {
  const store = createStore();
  let createdEntity: Record<string, unknown> | undefined;

  (
    store as unknown as {
      createEntity: (key: string, entity: Record<string, unknown>) => Promise<void>;
    }
  ).createEntity = async (_key, entity) => {
    createdEntity = entity;
  };

  const feedback = await store.createFeedback({
    id: "feedback-1",
    userId: "user-1",
    message: "Playback controls are hard to find.",
    feedbackType: "FEATURE",
    featureArea: "PLAYBACK",
    allowEmailContact: false,
    status: "IN_REVIEW",
    sourcePath: "/app/feedback",
    mirrorStatus: "FAILED",
    mirrorIssueNumber: 42,
    mirrorIssueUrl: "https://github.com/example/repo/issues/42",
    mirrorAttemptedAt: new Date("2026-04-10T10:00:00.000Z"),
    mirrorErrorCode: "MIRROR_TIMEOUT",
    mirrorErrorMessage: "Timed out"
  });

  assert.equal(createdEntity?.partitionKey, "feedback");
  assert.equal(createdEntity?.rowKey, "feedback-1");
  assert.equal(createdEntity?.message, "Playback controls are hard to find.");
  assert.equal(createdEntity?.mirrorStatus, "FAILED");
  assert.equal(createdEntity?.mirrorIssueNumber, 42);
  assert.equal(createdEntity?.mirrorAttemptedAt, "2026-04-10T10:00:00.000Z");
  assert.equal(feedback.feedbackType, "FEATURE");
  assert.equal(feedback.featureArea, "PLAYBACK");
  assert.equal(feedback.allowEmailContact, false);
  assert.equal(feedback.mirrorIssueNumber, 42);
  assert.equal(feedback.mirrorAttemptedAt?.toISOString(), "2026-04-10T10:00:00.000Z");
});

test("updateFeedback merges mirror fields and listFeedback sorts newest first", async () => {
  const store = createStore();
  let updatedEntity: Record<string, unknown> | undefined;

  (
    store as unknown as {
      getEntity: (key: string, partitionKey: string, rowKey: string) => Promise<Record<string, unknown> | null>;
    }
  ).getEntity = async (_key, _partitionKey, rowKey) => ({
    partitionKey: "feedback",
    rowKey,
    userId: "user-1",
    message: "Initial message",
    feedbackType: "GENERAL",
    featureArea: null,
    allowEmailContact: true,
    status: "NEW",
    sourcePath: "/app/feedback",
    mirrorStatus: "PENDING",
    createdAt: "2026-04-10T09:00:00.000Z",
    updatedAt: "2026-04-10T09:00:00.000Z",
    etag: "etag-1"
  });

  (
    store as unknown as {
      updateEntity: (key: string, entity: Record<string, unknown>, etag?: string) => Promise<boolean>;
    }
  ).updateEntity = async (_key, entity) => {
    updatedEntity = entity;
    return true;
  };

  const updated = await store.updateFeedback("feedback-2", {
    status: "DONE",
    mirrorStatus: "MIRRORED",
    mirrorIssueUrl: "https://github.com/example/repo/issues/99"
  });

  assert.equal(updatedEntity?.status, "DONE");
  assert.equal(updatedEntity?.mirrorStatus, "MIRRORED");
  assert.equal(updatedEntity?.mirrorIssueUrl, "https://github.com/example/repo/issues/99");
  assert.equal(updated?.status, "DONE");
  assert.equal(updated?.mirrorStatus, "MIRRORED");

  (
    store as unknown as {
      listEntities: (key: string, filter?: string) => Promise<Array<Record<string, unknown>>>;
    }
  ).listEntities = async () => [
    {
      partitionKey: "feedback",
      rowKey: "feedback-old",
      userId: "user-1",
      message: "Older",
      allowEmailContact: true,
      status: "NEW",
      mirrorStatus: "PENDING",
      createdAt: "2026-04-09T09:00:00.000Z",
      updatedAt: "2026-04-09T09:00:00.000Z"
    },
    {
      partitionKey: "feedback",
      rowKey: "feedback-new",
      userId: "user-2",
      message: "Newer",
      allowEmailContact: true,
      status: "NEW",
      mirrorStatus: "PENDING",
      createdAt: "2026-04-10T09:00:00.000Z",
      updatedAt: "2026-04-10T09:00:00.000Z"
    }
  ];

  const rows = await store.listFeedback(10);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["feedback-new", "feedback-old"]
  );
});

test("updateSnippet writes comment changes and preserves source fields", async () => {
  const store = createStore();
  let updatedEntity: Record<string, unknown> | undefined;

  (
    store as unknown as {
      getEntity: (key: string, partitionKey: string, rowKey: string) => Promise<Record<string, unknown> | null>;
    }
  ).getEntity = async () => ({
    partitionKey: "snippet",
    rowKey: "snippet-2",
    userId: "user-2",
    sourceUrl: "https://example.com/original",
    sourceTitle: "Original title",
    selectedText: "Original excerpt",
    selectedHtml: "<p>Original excerpt</p>",
    selectionMarkdown: "Original excerpt",
    contextMarkdown: "Original excerpt with more context",
    captureMarkdown: "# Original title",
    pageMetadataJson: '{"siteName":"Example Site","sectionHeadings":["News"]}',
    comment: "First note",
    createdAt: "2026-04-06T08:00:00.000Z",
    updatedAt: "2026-04-06T08:00:00.000Z",
    etag: "etag-1"
  });

  (
    store as unknown as {
      updateEntity: (key: string, entity: Record<string, unknown>, etag?: string) => Promise<boolean>;
    }
  ).updateEntity = async (_key, entity) => {
    updatedEntity = entity;
    return true;
  };

  const snippet = await store.updateSnippet("snippet-2", {
    comment: "Updated note"
  });

  assert.equal(updatedEntity?.sourceUrl, "https://example.com/original");
  assert.equal(updatedEntity?.selectedText, "Original excerpt");
  assert.equal(updatedEntity?.selectionMarkdown, "Original excerpt");
  assert.equal(updatedEntity?.pageMetadataJson, '{"siteName":"Example Site","sectionHeadings":["News"]}');
  assert.equal(updatedEntity?.comment, "Updated note");
  assert.equal(snippet?.pageMetadata?.siteName, "Example Site");
  assert.equal(snippet?.comment, "Updated note");
});
