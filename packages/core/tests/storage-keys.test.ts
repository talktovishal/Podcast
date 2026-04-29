import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLegacyDigestEmailStorageKey,
  buildLegacyDigestSummaryStorageKey,
  buildLegacyItemMarkdownStorageKey,
  buildLegacySummaryRunStorageKey,
  buildUserDigestEmailStorageKey,
  buildUserDigestSummaryStorageKey,
  buildUserItemMarkdownStorageKey,
  buildUserItemSummaryStorageKey,
  buildUserSummaryRunStorageKey,
  buildUserWikiBuildStateStorageKey,
  buildUserWikiManifestStorageKey,
  buildUserWikiPageStorageKey,
  buildUserWikiRootStorageKey
} from "../src/storage/keys";

test("markdown storage key builders emit stable user-centric paths", () => {
  assert.equal(buildUserItemMarkdownStorageKey("user-1", "item-1"), "users/user-1/markdown/items/item-1/canonical.md");
  assert.equal(buildUserItemSummaryStorageKey("user-1", "item-1"), "users/user-1/markdown/items/item-1/summary.md");
  assert.equal(buildUserDigestSummaryStorageKey("user-1", "WEEKLY", "2026-03-08"), "users/user-1/markdown/digests/weekly/2026-03-08/summary.md");
  assert.equal(buildUserDigestEmailStorageKey("user-1", "DAILY", "2026-03-08"), "users/user-1/markdown/digests/daily/2026-03-08/email.md");
  assert.equal(buildUserSummaryRunStorageKey("user-1", "summary-1"), "users/user-1/markdown/summaries/summary-1/summary.md");
  assert.equal(buildUserWikiRootStorageKey("user-1"), "users/user-1/wiki");
  assert.equal(buildUserWikiManifestStorageKey("user-1"), "users/user-1/wiki/manifest.json");
  assert.equal(buildUserWikiPageStorageKey("user-1", "concepts/index.md"), "users/user-1/wiki/pages/concepts/index.md");
  assert.equal(buildUserWikiBuildStateStorageKey("user-1", "run-1"), "users/user-1/wiki/state/builds/run-1.json");
});

test("legacy markdown storage key builders preserve existing paths", () => {
  assert.equal(buildLegacyItemMarkdownStorageKey("item-1"), "items/item-1/artifacts/source.md");
  assert.equal(buildLegacyDigestSummaryStorageKey("user-1", "WEEKLY", "2026-03-08"), "digests/user-1/weekly/2026-03-08/summary.md");
  assert.equal(buildLegacyDigestEmailStorageKey("user-1", "DAILY", "2026-03-08"), "digests/user-1/daily/2026-03-08/email.md");
  assert.equal(buildLegacySummaryRunStorageKey("user-1", "summary-1"), "summaries/user-1/summary-1/summary.md");
});
