import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync(new URL("../src/components/auth-landing-page.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../src/components/dashboard-client.tsx", import.meta.url), "utf8");
const feedbackSource = readFileSync(new URL("../src/components/feedback-form.tsx", import.meta.url), "utf8");
const summarySource = readFileSync(new URL("../src/components/summary-studio-client.tsx", import.meta.url), "utf8");
const quotaSource = readFileSync(new URL("../src/components/admin-quota-manager.tsx", import.meta.url), "utf8");
const adminFeedbackSource = readFileSync(new URL("../src/components/admin-feedback-inbox.tsx", import.meta.url), "utf8");

test("auth landing email flow submits through a semantic form", () => {
  assert.equal(authSource.includes("function handleEmailAuthSubmit"), true);
  assert.equal(authSource.includes("onSubmit={handleEmailAuthSubmit}"), true);
  assert.equal(authSource.includes('<form className="mt-4 space-y-3"'), true);
  assert.equal(authSource.includes('type="submit"'), true);
});

test("dashboard workspace and settings forms expose keyboard submit affordances", () => {
  assert.equal(dashboardSource.includes("function handleActiveSourceSubmit"), true);
  assert.equal(dashboardSource.includes("onSubmit={handleActiveSourceSubmit}"), true);
  assert.equal(dashboardSource.includes("function handleDigestSettingsSubmit"), true);
  assert.equal(dashboardSource.includes("onSubmit={handleDigestSettingsSubmit}"), true);
  assert.equal(dashboardSource.includes("function handleDemographicSurveySubmit"), true);
  assert.equal(dashboardSource.includes("onSubmit={handleDemographicSurveySubmit}"), true);
});

test("feedback, summary, and admin panels use form submit handlers where Enter should perform the primary action", () => {
  assert.equal(feedbackSource.includes("function handleFeedbackSubmit"), true);
  assert.equal(feedbackSource.includes("onSubmit={handleFeedbackSubmit}"), true);
  assert.equal(summarySource.includes("function handleSummaryCreateSubmit"), true);
  assert.equal(summarySource.includes("onSubmit={handleSummaryCreateSubmit}"), true);
  assert.equal(quotaSource.includes("function handleSearchSubmit"), true);
  assert.equal(quotaSource.includes("onSubmit={handleSearchSubmit}"), true);
  assert.equal(quotaSource.includes("function handleUserSaveSubmit"), true);
  assert.equal(adminFeedbackSource.includes("function handleFiltersSubmit"), true);
  assert.equal(adminFeedbackSource.includes("onSubmit={handleFiltersSubmit}"), true);
});
