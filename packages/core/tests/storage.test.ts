import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AzureBlobObjectStorage } from "../src/storage/azureBlobStorage";
import { LocalObjectStorage } from "../src/storage/localObjectStorage";
import { ContainerClient } from "@azure/storage-blob";

test("LocalObjectStorage put/get/head/delete with ranges", async () => {
  const root = await mkdtemp(join(tmpdir(), "articlepod-storage-test-"));
  const storage = new LocalObjectStorage(root);
  const key = "items/test/audio.mp3";

  try {
    const put = await storage.putObject(key, Buffer.from("0123456789", "utf8"), { contentType: "audio/mpeg" });
    assert.equal(put.key, key);
    assert.equal(put.bytes, 10);
    assert.equal(put.contentType, "audio/mpeg");

    const head = await storage.headObject(key);
    assert.equal(head.bytes, 10);
    assert.equal(head.contentType, "audio/mpeg");

    const full = await storage.getObject(key);
    assert.equal(full.toString("utf8"), "0123456789");

    const partial = await storage.getObject(key, { start: 3, end: 5 });
    assert.equal(partial.toString("utf8"), "345");

    await storage.deleteObject(key);

    await assert.rejects(() => storage.headObject(key));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("LocalObjectStorage blocks path traversal attempts", async () => {
  const root = await mkdtemp(join(tmpdir(), "articlepod-storage-test-"));
  const storage = new LocalObjectStorage(root);

  try {
    await assert.rejects(
      () => storage.getObject("../../etc/passwd"),
      (error: unknown) => error instanceof Error && error.message.includes("path traversal")
    );

    await assert.rejects(
      () => storage.putObject("../outside.txt", Buffer.from("bad"), {}),
      (error: unknown) => error instanceof Error && error.message.includes("path traversal")
    );

    await assert.rejects(
      () => storage.headObject("items/../../../etc/shadow"),
      (error: unknown) => error instanceof Error && error.message.includes("path traversal")
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AzureBlobObjectStorage requires valid credentials", () => {
  assert.throws(
    () =>
      new AzureBlobObjectStorage({
        container: "articlepod"
      }),
    (error: unknown) => error instanceof Error && error.message.includes("requires either connection string")
  );
});

test("Azure deletion ignores only confirmed missing blobs, not storage outages", async (t) => {
  const storage = new AzureBlobObjectStorage({
    container: "audio",
    connectionString: "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=ZmFrZQ==;EndpointSuffix=core.windows.net",
    createContainerIfMissing: false
  });
  let failure = { statusCode: 404, code: "BlobNotFound" };
  t.mock.method(ContainerClient.prototype, "deleteBlob", async () => { throw failure; });
  await storage.deleteObject("already-gone.mp3");
  for (const error of [
    { statusCode: 404, code: "ContainerNotFound" }, { statusCode: 404, code: "Unknown" },
    { statusCode: 403, code: "AuthorizationFailure" }, { statusCode: 429, code: "Throttled" },
    { statusCode: 503, code: "Unavailable" }
  ]) {
    failure = error;
    await assert.rejects(storage.deleteObject("audio.mp3"), (caught) => caught === error);
  }
});
