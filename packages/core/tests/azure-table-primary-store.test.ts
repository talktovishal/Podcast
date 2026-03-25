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
    tags: ["financial", "retirement"]
  });

  assert.equal(createdEntity?.priority, "HIGH");
  assert.equal(createdEntity?.tagsJson, '["financial","retirement"]');
  assert.deepEqual(item.tags, ["financial", "retirement"]);
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
    tags: ["financial", "retirement"]
  });

  assert.equal(updatedEntity?.priority, "HIGH");
  assert.equal(updatedEntity?.tagsJson, '["financial","retirement"]');
  assert.deepEqual(item?.tags, ["financial", "retirement"]);
});
