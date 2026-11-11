import assert from "node:assert/strict";
import test from "node:test";
import { findUsableAudioCache } from "../src/lib/audio-cache";

const missing = () => Object.assign(new Error("absent"), { code: "ENOENT" });

test("valid cache hits preserve their path and do not invalidate or synthesize", async () => {
  const entry = { filePath: "existing.mp3" };
  assert.equal(await findUsableAudioCache({
    find: async () => entry,
    discardIfUnchanged: async () => { assert.fail("valid cache must not be deleted"); },
    storage: { headObject: async (key) => ({ key, bytes: 42 }) }
  }), entry);
});

test("missing cached bytes invalidate exactly the observed row and permit a new cache entry", async () => {
  let entry: { filePath: string } | null = { filePath: "purged.mp3" };
  const observed = entry;
  const input = {
    find: async () => entry,
    discardIfUnchanged: async (value: { filePath: string }) => {
      assert.equal(value, observed);
      entry = null;
      return true;
    },
    storage: { headObject: async (key: string) => {
      if (key === "purged.mp3") throw missing();
      return { key, bytes: 42 };
    } }
  };
  assert.equal(await findUsableAudioCache(input), null);
  entry = { filePath: "regenerated.mp3" };
  assert.equal(await findUsableAudioCache(input), entry);
});

test("a concurrent replacement is re-read rather than deleted or overwritten", async () => {
  const refreshed = { filePath: "refreshed.mp3" };
  let entry = { filePath: "stale.mp3" };
  let discards = 0;
  assert.equal(await findUsableAudioCache({
    find: async () => entry,
    discardIfUnchanged: async () => { discards++; entry = refreshed; return false; },
    storage: { headObject: async (key) => {
      if (key === "stale.mp3") throw missing();
      return { key, bytes: 42 };
    } }
  }), refreshed);
  assert.equal(discards, 1);
});

test("storage outages preserve the cache and prevent a synthesis-triggering miss", async () => {
  for (const error of [{ statusCode: 403 }, { statusCode: 429 }, { statusCode: 503 }, { code: "ETIMEDOUT" }]) {
    await assert.rejects(findUsableAudioCache({
      find: async () => ({ filePath: "existing.mp3" }),
      discardIfUnchanged: async () => { assert.fail("outage must not invalidate cache"); },
      storage: { headObject: async () => { throw error; } }
    }), (caught) => caught === error);
  }
});

test("persistent cache contention fails explicitly after bounded attempts", async () => {
  let discards = 0;
  await assert.rejects(findUsableAudioCache({
    find: async () => ({ filePath: "changing.mp3" }),
    discardIfUnchanged: async () => { discards++; return false; },
    storage: { headObject: async () => { throw missing(); } }
  }), /changed repeatedly/);
  assert.equal(discards, 3);
});
