import test from "node:test";
import assert from "node:assert/strict";
import { buildEpisodeDescription } from "../src/utils/description";

test("buildEpisodeDescription strips markdown artifacts and keeps readable summary", () => {
  const source = `
## Weekly Update

- We shipped a fix for playback failures.
- Added support for [YouTube Music](https://music.youtube.com).
- See full details at https://example.com/changelog
`;

  const description = buildEpisodeDescription(source, { maxLength: 180, targetSentences: 2 });
  assert.equal(description.includes("##"), false);
  assert.equal(description.includes("https://"), false);
  assert.equal(description.includes("[YouTube Music]"), false);
  assert.equal(description.includes("We shipped a fix for playback failures."), true);
});

test("buildEpisodeDescription prefers sentence boundaries", () => {
  const source =
    "First sentence is concise and clear. Second sentence adds listener context. Third sentence should not be included.";
  const description = buildEpisodeDescription(source, { maxLength: 200, targetSentences: 2 });
  assert.equal(description, "First sentence is concise and clear. Second sentence adds listener context.");
});

test("buildEpisodeDescription truncates long text at a word boundary", () => {
  const source =
    "This description is intentionally long so we can verify that truncation keeps words intact and appends an ellipsis when we exceed the configured limit.";
  const description = buildEpisodeDescription(source, { maxLength: 80, targetSentences: 3 });
  assert.equal(description.length <= 80, true);
  assert.equal(description.endsWith("..."), true);
});

test("buildEpisodeDescription falls back when text is empty", () => {
  const description = buildEpisodeDescription("   ");
  assert.equal(description, "Listen to this narrated episode in your private feed.");
});
