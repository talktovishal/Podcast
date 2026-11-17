import assert from "node:assert/strict";
import test from "node:test";
import type { WikiManifest } from "@articlepod/core";
import { collectMirrorStorageKeys, dedupeMirrorRows, hydrateMirrorRows, type MirrorSnapshot } from "../src/lib/ops/user-mirror";

function baseSnapshot(): MirrorSnapshot {
  return {
    users: [],
    sandboxBillingAccounts: [],
    sessions: [],
    feedTokens: [],
    digestFeedTokens: [],
    shareTokens: [],
    oauthIdentities: [],
    extensionConnectCodes: [],
    extensionTokens: [],
    items: [],
    snippets: [],
    itemArtifacts: [],
    episodes: [],
    jobs: [],
    chunkCaches: [],
    digestSettings: [],
    digestRuns: [],
    digestEpisodes: [],
    summaryRuns: [],
    summaryRunItems: [],
    summaryEpisodes: [],
    userDemographicSurveys: [],
    userFeedback: [],
    billingWebhookEvents: []
  };
}

test("collectMirrorStorageKeys includes user-scoped artifacts, audio, and wiki blobs without duplicates", () => {
  const snapshot = baseSnapshot();
  snapshot.items = [{ sourceFilePath: "/uploads/user-1/article.pdf" }];
  snapshot.itemArtifacts = [
    { storageKey: "users/user-1/markdown/items/item-1/canonical.md" },
    { storageKey: "users/user-1/markdown/items/item-1/canonical.md" }
  ];
  snapshot.episodes = [{ audioPath: "episodes/user-1/item-1.mp3" }];
  snapshot.chunkCaches = [{ filePath: "chunks/user-1/item-1/chunk-0.mp3" }];
  snapshot.digestRuns = [{ summaryStorageKey: "users/user-1/markdown/digests/daily/2026-04-10/summary.md", emailStorageKey: "users/user-1/markdown/digests/daily/2026-04-10/email.md" }];
  snapshot.digestEpisodes = [{ audioPath: "digests/user-1/daily/2026-04-10/episode.mp3" }];
  snapshot.summaryRuns = [{ summaryStorageKey: "users/user-1/markdown/summaries/run-1/summary.md" }];
  snapshot.summaryEpisodes = [{ audioPath: "summaries/user-1/run-1/episode.mp3" }];

  const wikiManifest: WikiManifest = {
    version: 1,
    userId: "user-1",
    buildRunId: "run-77",
    generatedAt: "2026-04-11T00:00:00.000Z",
    buildMode: "full",
    defaultPagePath: "index.md",
    schema: {
      promptSource: "copied",
      promptHash: "abc",
      wrapperVersion: "1",
      runtimeVersion: "1",
      karpathyPromptPath: "/tmp/llm-wiki.md"
    },
    sourceState: {
      counts: { items: 1, snippets: 0, total: 1 },
      hashes: {},
      changedSourceIds: [],
      deletedSourceIds: []
    },
    pages: [
      {
        path: "index.md",
        slug: ["index"],
        routePath: "/wiki/index",
        title: "Index",
        type: "note",
        summary: null,
        tags: [],
        sourceIds: ["item-1"],
        sourceKind: "item",
        sourceUrl: null,
        sourceTitle: null,
        hash: "page-hash",
        outgoingLinks: [],
        backlinks: [],
        updated: null,
        sizeBytes: 120,
        storageKey: "users/user-1/wiki/pages/index.md",
        searchText: "Index"
      }
    ]
  };

  assert.deepEqual(collectMirrorStorageKeys(snapshot, wikiManifest), [
    "chunks/user-1/item-1/chunk-0.mp3",
    "digests/user-1/daily/2026-04-10/episode.mp3",
    "episodes/user-1/item-1.mp3",
    "summaries/user-1/run-1/episode.mp3",
    "uploads/user-1/article.pdf",
    "users/user-1/markdown/digests/daily/2026-04-10/email.md",
    "users/user-1/markdown/digests/daily/2026-04-10/summary.md",
    "users/user-1/markdown/items/item-1/canonical.md",
    "users/user-1/markdown/summaries/run-1/summary.md",
    "users/user-1/wiki/manifest.json",
    "users/user-1/wiki/pages/index.md",
    "users/user-1/wiki/state/builds/run-77.json"
  ]);
});

test("hydrateMirrorRows converts configured date strings into Date objects", () => {
  const [hydrated] = hydrateMirrorRows("summaryRuns", [
    {
      id: "run-1",
      userId: "user-1",
      status: "READY",
      windowStart: "2026-04-01T00:00:00.000Z",
      windowEnd: "2026-04-02T00:00:00.000Z",
      completedAt: "2026-04-02T01:00:00.000Z",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z"
    }
  ]);

  assert.ok(hydrated.windowStart instanceof Date);
  assert.ok(hydrated.windowEnd instanceof Date);
  assert.ok(hydrated.completedAt instanceof Date);
  assert.equal((hydrated.windowStart as Date).toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal((hydrated.completedAt as Date).toISOString(), "2026-04-02T01:00:00.000Z");
});

test("dedupeMirrorRows keeps the preferred feed token row when token hashes collide", () => {
  const deduped = dedupeMirrorRows("feedTokens", [
    {
      id: "old-row",
      tokenHash: "same-hash",
      tokenValue: "old-token",
      active: false,
      createdAt: "2026-04-01T00:00:00.000Z"
    },
    {
      id: "new-row",
      tokenHash: "same-hash",
      tokenValue: "new-token",
      active: true,
      createdAt: "2026-04-02T00:00:00.000Z"
    }
  ]);

  assert.deepEqual(
    deduped.map((row) => row.id),
    ["new-row"]
  );
});
