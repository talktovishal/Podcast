import assert from "node:assert/strict";
import test from "node:test";
import { TableClient } from "@azure/data-tables";
import { AzureTablePrimaryStore } from "../src/metadata/azureTablePrimaryStore";
import { AzureTableQueueMetadataMirror } from "../src/metadata/azureTableMirror";

const options = {
  tablePrefix: "buildtest",
  connectionString: "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=ZmFrZQ==;EndpointSuffix=core.windows.net",
  createTablesIfMissing: false
};

test("normal construction still requires credentials for both Azure stores", () => {
  for (const Store of [AzureTablePrimaryStore, AzureTableQueueMetadataMirror]) {
    assert.throws(() => new Store({ tablePrefix: "buildtest" }), /requires connection string/);
  }
});

test("deferred stores retain their backends and reject credential-free operations", async () => {
  const primary = new AzureTablePrimaryStore({ tablePrefix: "buildtest", deferInitialization: true });
  const mirror = new AzureTableQueueMetadataMirror({ tablePrefix: "buildtest", deferInitialization: true });
  assert.equal(primary.backend, "azure_table");
  assert.equal(mirror.backend, "azure_table");
  assert.equal(mirror.enabled, true);
  await assert.rejects(primary.findUserById("fixture-user"), /requires connection string/);
  await assert.rejects(mirror.deleteItemProjection("fixture-item"), /requires connection string/);
});

test("deferred primary initializes once on first use, including concurrent reads", async (t) => {
  const factory = t.mock.method(TableClient, "fromConnectionString");
  t.mock.method(TableClient.prototype, "getEntity", async () => {
    throw Object.assign(new Error("fixture missing entity"), { statusCode: 404 });
  });
  const primary = new AzureTablePrimaryStore({ ...options, deferInitialization: true });
  assert.equal(factory.mock.callCount(), 0);
  assert.deepEqual(await Promise.all([primary.findUserById("fixture-a"), primary.findUserById("fixture-b")]), [null, null]);
  const initializedClients = factory.mock.callCount();
  assert.ok(initializedClients > 0);
  assert.equal(await primary.findUserById("fixture-c"), null);
  assert.equal(factory.mock.callCount(), initializedClients);
});

test("deferred mirror initializes once and keeps its normal client operations", async (t) => {
  const factory = t.mock.method(TableClient, "fromConnectionString");
  const deletion = t.mock.method(TableClient.prototype, "deleteEntity", async () => ({}));
  const mirror = new AzureTableQueueMetadataMirror({ ...options, deferInitialization: true });
  assert.equal(factory.mock.callCount(), 0);
  await mirror.deleteItemProjection("fixture-a");
  assert.equal(factory.mock.callCount(), 3);
  await mirror.deleteJobProjection("fixture-b");
  assert.equal(factory.mock.callCount(), 3);
  assert.deepEqual(deletion.mock.calls.map((call) => call.arguments), [["item", "fixture-a"], ["job", "fixture-b"]]);
});

test("deferred initialization preserves table-creation failures without reading data", async (t) => {
  const creation = t.mock.method(TableClient.prototype, "createTable", async () => {
    throw new Error("fixture table initialization failed");
  });
  const read = t.mock.method(TableClient.prototype, "getEntity");
  const primary = new AzureTablePrimaryStore({ ...options, createTablesIfMissing: true, deferInitialization: true });
  assert.equal(creation.mock.callCount(), 0);
  await assert.rejects(primary.findUserById("fixture-user"), /fixture table initialization failed/);
  const initializedTables = creation.mock.callCount();
  assert.ok(initializedTables > 0);
  await assert.rejects(primary.findUserById("fixture-user"), /fixture table initialization failed/);
  assert.equal(creation.mock.callCount(), initializedTables);
  assert.equal(read.mock.callCount(), 0);
});

test("normal construction still initializes clients immediately", (t) => {
  const factory = t.mock.method(TableClient, "fromConnectionString");
  new AzureTablePrimaryStore(options);
  const primaryClients = factory.mock.callCount();
  assert.ok(primaryClients > 0);
  new AzureTableQueueMetadataMirror(options);
  assert.equal(factory.mock.callCount(), primaryClients + 3);
});
