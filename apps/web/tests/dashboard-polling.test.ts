import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/dashboard-client.tsx", import.meta.url), "utf8");

test("dashboard polling runs only while jobs are in progress", () => {
  assert.equal(source.includes("if (readOnly || !showItemsSection || inProgressCount === 0)"), true);
  assert.equal(source.includes("const intervalMs = 3000;"), true);
});

test("dashboard polling skips refresh while tab is hidden", () => {
  assert.equal(source.includes('if (document.visibilityState !== "visible")'), true);
});

test("dashboard refresh merges new items without churning episode media tokens", () => {
  assert.equal(source.includes("mergeItemsPreservingEpisodeTokens(previous, payload.items)"), true);
});
