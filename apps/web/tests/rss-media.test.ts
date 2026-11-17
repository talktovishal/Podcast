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
  assert.deepEqual(calls, ["one.mp3", "one.m4a", "two.mp3"]);
  assert.equal(heads.get("one.mp3"), null);
  assert.equal(heads.get("one.m4a")?.bytes, 12);
  assert.equal(deriveAlternateAudioPath("audio.wav"), null);
  assert.equal(deriveAlternateAudioPath("audio.m4a"), "audio.mp3");
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
