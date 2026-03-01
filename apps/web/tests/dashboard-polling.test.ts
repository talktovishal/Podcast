import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/dashboard-client.tsx", import.meta.url), "utf8");

test("dashboard polling uses fast active interval and slower idle interval", () => {
  assert.equal(source.includes("if (readOnly || !showItemsSection)"), true);
  assert.equal(source.includes("const ACTIVE_REFRESH_INTERVAL_MS = 3000;"), true);
  assert.equal(source.includes("const IDLE_REFRESH_INTERVAL_MS = 20000;"), true);
  assert.equal(source.includes("const intervalMs = inProgressCount > 0 ? ACTIVE_REFRESH_INTERVAL_MS : IDLE_REFRESH_INTERVAL_MS;"), true);
});

test("dashboard polling skips hidden tabs and refreshes on focus/visibility", () => {
  assert.equal(source.includes('if (document.visibilityState !== "visible")'), true);
  assert.equal(source.includes('if (document.visibilityState === "visible")'), true);
  assert.equal(source.includes('window.addEventListener("focus", refreshIfVisible);'), true);
  assert.equal(source.includes('document.addEventListener("visibilitychange", handleVisibilityChange);'), true);
});

test("dashboard refresh merges new items without churning episode media tokens", () => {
  assert.equal(source.includes("mergeItemsPreservingEpisodeTokens(previous, payload.items)"), true);
});
