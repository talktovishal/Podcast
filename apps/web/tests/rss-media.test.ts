import assert from "node:assert/strict";
import test from "node:test";
import { deriveAlternateAudioPath, inspectFeedMedia } from "../src/lib/rss-media";
import { filterReadyItemEpisodes } from "../src/lib/rss-item-eligibility";

test("feed eligibility resolves candidate items beyond 500, once per item, in stable episode order", async () => {
  const history = Array.from({ length: 601 }, (_, i) => ({ id: `item-${i}`, userId: "owner", status: "READY" }));
  history[599].status = "PROCESSING";
  history[600].userId = "other-user";
  const byId = new Map(history.map((item) => [item.id, item]));
  const episodes = [
    { id: "new", itemId: "item-598" },
    { id: "old", itemId: "item-0" },
    { id: "pending", itemId: "item-599" },
    { id: "foreign", itemId: "item-600" },
    { id: "missing", itemId: "deleted" },
    { id: "duplicate-candidate", itemId: "item-0" }
  ];
  assert.ok(!history.slice(-500).some((item) => item.id === "item-0"));
  const calls: string[] = [];
  let active = 0;
  const eligible = await filterReadyItemEpisodes(episodes, "owner", async (id) => {
    assert.equal(++active, 1, "candidate resolution must not fan out without a bound");
    calls.push(id);
    await Promise.resolve();
    active--;
    return byId.get(id) ?? null;
  });
  assert.deepEqual(eligible.map((episode) => episode.id), ["new", "old", "duplicate-candidate"]);
  assert.deepEqual(calls, ["item-598", "item-0", "item-599", "item-600", "deleted"]);
});

test("feed candidate lookup propagates outages instead of returning a reduced feed", async () => {
  const failure = new Error("metadata unavailable");
  await assert.rejects(filterReadyItemEpisodes([{ itemId: "old" }], "owner", async () => { throw failure; }),
    (error) => error === failure);
  assert.deepEqual(await filterReadyItemEpisodes([], "owner", async () => { throw failure; }), []);
});

test("feed preflight checks originals and missing item alternatives before returning", async () => {
  const calls: string[] = [];
  const heads = await inspectFeedMedia([
    { audioPath: "one.mp3", feedKind: "item" },
    { audioPath: "two.mp3", feedKind: "summary" }
  ], {
    headObject: async (key) => {
      calls.push(key);
      if (key === "one.mp3") throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return { key, bytes: 12 };
    }
  });
  assert.deepEqual(calls, ["one.mp3", "two.mp3", "one.m4a"]);
  assert.equal(heads.get("one.mp3"), null);
  assert.equal(heads.get("one.m4a")?.bytes, 12);
  assert.equal(deriveAlternateAudioPath("audio.wav"), null);
  assert.equal(deriveAlternateAudioPath("audio.m4a"), "audio.mp3");
});

for (const missingOriginals of [false, true]) {
  test(`preflight bounds all reads at four and preserves order after out-of-order completion (alternates=${missingOriginals})`, async () => {
    const episodes = Array.from({ length: 8 }, (_, i) => ({ audioPath: `${i}.mp3`, feedKind: "item" as const }));
    let active = 0;
    let peak = 0;
    let checks = 0;
    let waves = 0;
    const releases: Array<() => void> = [];
    const pending = inspectFeedMedia(episodes, {
      headObject: async (key) => {
        checks++;
        peak = Math.max(peak, ++active);
        await new Promise<void>((resolve) => { releases.push(resolve); });
        active--;
        if (missingOriginals && key.endsWith(".mp3") && Number(key.split(".")[0]) % 2 === 0) {
          throw Object.assign(new Error("missing"), { code: "ENOENT" });
        }
        return { key, bytes: 12 };
      }
    });
    assert.equal(active, 4);
    while (releases.length > 0) {
      assert.ok(++waves <= 8, "preflight must finish in bounded waves");
      for (const release of releases.splice(0).reverse()) release();
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    const heads = await pending;
    assert.equal(peak, 4);
    assert.equal(active, 0);
    assert.equal(checks, missingOriginals ? 12 : 8);
    assert.deepEqual([...heads.keys()], episodes.flatMap((episode, i) =>
      missingOriginals && i % 2 === 0 ? [episode.audioPath, `${i}.m4a`] : [episode.audioPath]
    ));
    if (!missingOriginals) {
      assert.equal(waves, 2, "eight equal-latency checks require two waves, rather than eight serial waves");
    }
  });
}

test("failed preflight waits for in-flight reads and never returns partial repair information", async () => {
  const failure = new Error("storage outage");
  let release: () => void = () => { throw new Error("read has not started"); };
  let finished = false;
  const pending = inspectFeedMedia([
    { audioPath: "failed.mp3", feedKind: "item" },
    { audioPath: "slow.mp3", feedKind: "summary" }
  ], {
    headObject: async (key) => {
      if (key === "failed.mp3") throw failure;
      await new Promise<void>((resolve) => { release = resolve; });
      return { key, bytes: 12 };
    }
  });
  const checked = assert.rejects(pending, (error) => error === failure).then(() => { finished = true; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(finished, false);
  release();
  await checked;
  assert.equal(finished, true);
  assert.deepEqual(await inspectFeedMedia([], { headObject: async () => { throw failure; } }), new Map());
});

test("later storage outages prevent a completed preflight, including on alternate paths", async () => {
  for (const failurePath of ["one.m4a", "two.mp3"]) {
    for (const statusCode of [403, 429, 500, 503]) {
      const error = Object.assign(new Error("unavailable"), { statusCode });
      await assert.rejects(inspectFeedMedia([
        { audioPath: "one.mp3", feedKind: "item" },
        { audioPath: "two.mp3", feedKind: "item" }
      ], {
        headObject: async (key) => {
          if (key === failurePath) throw error;
          throw Object.assign(new Error("missing"), { code: "ENOENT" });
        }
      }), (caught) => caught === error);
    }
  }
});
