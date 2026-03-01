import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("admin page uses tabbed analytics dashboard component", () => {
  const source = readFileSync(new URL("../src/app/admin/page.tsx", import.meta.url), "utf8");
  assert.equal(source.includes("AdminAnalyticsDashboard"), true);
  assert.equal(source.includes("AdminQuotaManager"), true);
  assert.equal(source.includes("AdminFeedbackInbox"), true);
  assert.equal(source.includes("Admin analytics"), true);
});

test("admin analytics dashboard defines investor and reliability tabs", () => {
  const source = readFileSync(new URL("../src/components/admin-analytics-dashboard.tsx", import.meta.url), "utf8");
  assert.equal(source.includes("Investor Summary"), true);
  assert.equal(source.includes("Reliability"), true);
  assert.equal(source.includes("Export CSV"), true);
});
