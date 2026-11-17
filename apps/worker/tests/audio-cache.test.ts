import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalObjectStorage } from "@articlepod/core/src/storage/localObjectStorage";
import { buildItemAudioStorageKey } from "@articlepod/core/src/storage/keys";
import { copyCachedAudio, findUsableAudioCache } from "../src/lib/audio-cache";

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

for (const mimeType of ["audio/mpeg", "audio/mp4"]) {
  test(`cache copies have independent ownership and preserve bytes (${mimeType})`, async () => {
    const root = await mkdtemp(join(tmpdir(), "articlepod-audio-ownership-"));
    const storage = new LocalObjectStorage(root);
    const bytes = Buffer.from("0123456789");
    const source = "items/original/episode." + (mimeType === "audio/mpeg" ? "mp3" : "m4a");
    const entry = { filePath: source, audioBytes: bytes.length, mimeType };
    try {
      await storage.putObject(source, bytes, { contentType: mimeType });
      let recorded = false;
      const copy = await copyCachedAudio(entry, "copy", "a".repeat(64), storage, async () => {
        await assert.rejects(storage.headObject(buildItemAudioStorageKey("copy", "a".repeat(64), mimeType)));
        recorded = true;
      });
      assert.ok(copy);
      assert.equal(recorded, true);
      assert.notEqual(copy.filePath, source);
      assert.equal(copy.filePath, buildItemAudioStorageKey("copy", "a".repeat(64), mimeType));
      assert.deepEqual(await storage.getObject(copy.filePath), bytes);
      assert.equal((await storage.headObject(copy.filePath)).contentType, mimeType);
      const regeneration = await copyCachedAudio(entry, "original", "b".repeat(64), storage);
      assert.ok(regeneration);
      assert.notEqual(regeneration.filePath, source);
      assert.deepEqual(await storage.getObject(source), bytes);
      await storage.deleteObject(source);
      assert.deepEqual(await storage.getObject(copy.filePath, { start: 0, end: 1 }), Buffer.from("01"));
      assert.deepEqual(await storage.getObject(regeneration.filePath), bytes);
      await storage.deleteObject(copy.filePath);
      assert.deepEqual(await storage.getObject(regeneration.filePath), bytes);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("a cache source lost between HEAD and GET invalidates only the observed entry", async () => {
  const entry = { filePath: "owner.mp3", audioBytes: 3, mimeType: "audio/mpeg" };
  let current: typeof entry | null = entry;
  let discarded = 0;
  const result = await findUsableAudioCache({
    find: async () => current,
    discardIfUnchanged: async (observed) => {
      assert.equal(observed, entry);
      discarded++;
      current = null;
      return true;
    },
    storage: { headObject: async (key) => ({ key, bytes: 3 }) },
    prepare: (observed) => copyCachedAudio(observed, "copy", "a".repeat(64), {
      getObject: async () => { throw missing(); },
      putObject: async () => assert.fail("a missing source must never be written"),
      headObject: async () => assert.fail("a missing source has no destination")
    })
  });
  assert.equal(result, null);
  assert.equal(discarded, 1);
});

test("copy failures preserve cache state and cannot become synthesis-triggering misses", async () => {
  for (const phase of ["read", "write", "verify", "record"] as const) {
    const failure = Object.assign(new Error(phase), { statusCode: 503 });
    const entry = { filePath: "owner.mp3", audioBytes: 3, mimeType: "audio/mpeg" };
    let writes = 0;
    await assert.rejects(findUsableAudioCache({
      find: async () => entry,
      discardIfUnchanged: async () => assert.fail("copy outage must not discard the source"),
      storage: { headObject: async (key) => ({ key, bytes: 3 }) },
      prepare: (observed) => copyCachedAudio(observed, "copy", "a".repeat(64), {
        getObject: async () => { if (phase === "read") throw failure; return Buffer.from("123"); },
        putObject: async (key) => { writes++; if (phase === "write") throw failure; return { key, bytes: 3 }; },
        headObject: async (key) => { if (phase === "verify") throw failure; return { key, bytes: 3 }; }
      }, async () => { if (phase === "record") throw failure; })
    }), (error) => error === failure);
    assert.equal(writes, phase === "read" || phase === "record" ? 0 : 1);
  }
});

test("empty, truncated and incorrectly stored cache copies are rejected", async () => {
  for (const body of [Buffer.alloc(0), Buffer.from("12")]) {
    await assert.rejects(copyCachedAudio(
      { filePath: "owner.mp3", audioBytes: 3, mimeType: "audio/mpeg" }, "copy", "a".repeat(64), {
        getObject: async () => body,
        putObject: async () => assert.fail("invalid source must not be written"),
        headObject: async () => assert.fail("invalid source must not be verified")
      }
    ), /length/);
  }
  await assert.rejects(copyCachedAudio(
    { filePath: "owner.mp3", audioBytes: 3, mimeType: "audio/mpeg" }, "copy", "a".repeat(64), {
      getObject: async () => Buffer.from("123"),
      putObject: async (key) => ({ key, bytes: 3 }),
      headObject: async (key) => ({ key, bytes: 2 })
    }
  ), /Copied audio length/);
});

test("destination absence is an error, not a missing source or cache invalidation", async () => {
  await assert.rejects(copyCachedAudio(
    { filePath: "owner.mp3", audioBytes: 3, mimeType: "audio/mpeg" }, "copy", "a".repeat(64), {
      getObject: async () => Buffer.from("123"),
      putObject: async (key) => ({ key, bytes: 3 }),
      headObject: async () => { throw missing(); }
    }
  ), /absent/);
});
