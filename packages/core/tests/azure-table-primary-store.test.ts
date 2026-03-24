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
