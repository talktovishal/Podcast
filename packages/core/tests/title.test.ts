import test from "node:test";
import assert from "node:assert/strict";
import { resolveEpisodeTitle } from "../src/utils/title";

test("resolveEpisodeTitle prefers extracted title when meaningful", () => {
  const title = resolveEpisodeTitle("A Clear Article Headline", "Some body text.");
  assert.equal(title, "A Clear Article Headline");
});

test("resolveEpisodeTitle infers title when extracted title is placeholder", () => {
  const title = resolveEpisodeTitle(
    "Untitled",
    "How to evaluate a private podcast feed in ten minutes. Start by validating RSS and range requests."
  );
  assert.equal(title, "How to evaluate a private podcast feed in ten minutes");
});

test("resolveEpisodeTitle infers title when extracted title is empty", () => {
  const title = resolveEpisodeTitle("", "A short but useful sentence about testing feed clients.");
  assert.equal(title, "A short but useful sentence about testing feed clients");
});

test("resolveEpisodeTitle truncates very long titles safely", () => {
  const title = resolveEpisodeTitle(
    "This is an intentionally long title that should be truncated to keep episode labels readable across podcast clients and dashboard views",
    "Body text."
  );
  assert.ok(title.endsWith("..."));
  assert.ok(title.length <= 120);
});
