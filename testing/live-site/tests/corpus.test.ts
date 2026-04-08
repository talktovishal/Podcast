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

test("parseCliOptions accepts a packaged extension smoke override", () => {
  const options = parseCliOptions(["--mode", "extension", "--env", "local", "--extension-build", "package"]);
  assert.equal(options.mode, "extension");
  assert.equal(options.env, "local");
  assert.equal(options.extensionBuild, "package");
});

test("parseCliOptions ignores a forwarded double-dash separator from pnpm run", () => {
  const options = parseCliOptions(["--mode", "url", "--env", "prod-probe", "--", "--site", "cnn-business", "--limit", "1"]);
  assert.equal(options.mode, "url");
  assert.equal(options.env, "prod-probe");
  assert.deepEqual(options.siteIds, ["cnn-business"]);
  assert.equal(options.limit, 1);
});
