import assert from "node:assert/strict";
import test from "node:test";
import { loadCorpus } from "../src/corpus.js";

test("loadCorpus parses the checked-in Markdown corpus", async () => {
  const entries = await loadCorpus();
  assert.ok(entries.length >= 5);
  assert.ok(entries.some((entry) => entry.id === "cnn-business"));
  assert.ok(entries.every((entry) => entry.url.startsWith("https://")));
});
