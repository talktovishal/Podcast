import assert from "node:assert/strict";
import test from "node:test";
import { filterCorpus, loadCorpus } from "../src/corpus.js";
import { parseCliOptions } from "../src/options.js";

test("loadCorpus parses the checked-in Markdown corpus", async () => {
  const entries = await loadCorpus();
  assert.equal(entries.length >= 20, true);
  assert.equal(entries.some((entry) => entry.id === "reuters-world"), true);
  assert.equal(entries.some((entry) => entry.id === "linkedin-pulse"), true);
});

test("filterCorpus applies site, cohort, and limit filters", async () => {
  const entries = await loadCorpus();
  const options = parseCliOptions(["--site", "reuters-world,cnn-business", "--cohort", "news", "--limit", "1"]);
  const filtered = filterCorpus(entries, options);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.cohort, "news");
  assert.equal(["reuters-world", "cnn-business"].includes(filtered[0]?.id || ""), true);
});
