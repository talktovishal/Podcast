import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AzureBlobObjectStorage } from "../src/storage/azureBlobStorage";
import { LocalObjectStorage } from "../src/storage/localObjectStorage";

test("LocalObjectStorage put/get/head/delete with ranges", async () => {
  const root = await mkdtemp(join(tmpdir(), "listenlater-storage-test-"));
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

test("AzureBlobObjectStorage requires valid credentials", () => {
  assert.throws(
    () =>
      new AzureBlobObjectStorage({
        container: "listenlater"
      }),
    (error: unknown) => error instanceof Error && error.message.includes("requires either connection string")
  );
});
