import assert from "node:assert/strict";
import test from "node:test";
import { classifyPathFailure, classifyProdProbeFailure, matchLocalExpectation, matchProdProbeExpectation } from "../src/report.js";

test("matchLocalExpectation respects manual review and exact matches", () => {
  assert.equal(matchLocalExpectation("manual_review", "blocked_without_extension_hint"), true);
  assert.equal(matchLocalExpectation("ready", "ready"), true);
  assert.equal(matchLocalExpectation("ready", "blocked_with_extension_hint"), false);
});

test("matchProdProbeExpectation treats blocked expectations as coarse blocked matches", () => {
  assert.equal(matchProdProbeExpectation("blocked_with_extension_hint", "blocked_without_extension_hint"), true);
  assert.equal(matchProdProbeExpectation("ready", "blocked_without_extension_hint"), false);
});

test("classifyPathFailure treats missing extension hints as product regressions", () => {
  const classification = classifyPathFailure({
    path: "url",
    expected: "blocked_with_extension_hint",
    actual: "blocked_without_extension_hint",
    matchedExpectation: false,
    status: "failed",
    sourceUrl: "https://example.com",
    title: "Example",
    durationMs: 10,
    requiresManual: false
  });
  assert.equal(classification, "product_regression");
});

test("classifyProdProbeFailure treats blocked-ready mismatches as site behavior changes", () => {
  const classification = classifyProdProbeFailure({
    expected: "ready",
    actual: "blocked_without_extension_hint",
    matchedExpectation: false,
    status: "failed",
    durationMs: 10
  });
  assert.equal(classification, "site_behavior_changed");
});
