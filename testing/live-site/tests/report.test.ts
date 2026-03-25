import assert from "node:assert/strict";
import test from "node:test";
import { extractFirstJsonObject, extractProbeJsonFromLog, selectDispatchedProbeRun } from "../src/prod-probe.js";
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

test("selectDispatchedProbeRun prefers the newest workflow_dispatch run after dispatch time", () => {
  const selected = selectDispatchedProbeRun(
    [
      {
        databaseId: 1,
        createdAt: "2026-03-25T05:59:44Z",
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        url: "https://example.com/1"
      },
      {
        databaseId: 2,
        createdAt: "2026-03-25T06:00:35Z",
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        url: "https://example.com/2"
      },
      {
        databaseId: 3,
        createdAt: "2026-03-25T06:00:36Z",
        event: "push",
        status: "completed",
        conclusion: "success",
        url: "https://example.com/3"
      }
    ],
    Date.parse("2026-03-25T06:00:33Z")
  );

  assert.equal(selected?.databaseId, 2);
});

test("extractFirstJsonObject returns the first balanced JSON object", () => {
  const payload = extractFirstJsonObject(`prefix {"ignore":true}\nsuffix`);
  assert.deepEqual(payload, {
    ignore: true
  });
});

test("extractProbeJsonFromLog prefers the JSON payload after the probe marker", () => {
  const payload = extractProbeJsonFromLog(`report-to: {"group":"header"}\n== VM extraction probe ==\n{\n  "ok": false,\n  "error": {\n    "code": "EXTRACTION_FAILED"\n  }\n}\nundefined`);
  assert.deepEqual(payload, {
    ok: false,
    error: {
      code: "EXTRACTION_FAILED"
    }
  });
});
