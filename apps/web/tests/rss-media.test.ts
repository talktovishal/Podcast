import assert from "node:assert/strict";
import test from "node:test";
import { deriveAlternateAudioPath, inspectFeedMedia } from "../src/lib/rss-media";

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
