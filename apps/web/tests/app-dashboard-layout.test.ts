import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("app dashboard links to settings and renders smart feed actions", () => {
  const source = readFileSync(new URL("../src/app/app/page.tsx", import.meta.url), "utf8");

  assert.equal(source.includes('href="/app/settings"'), true);
  assert.equal(source.includes('href="/app/feedback"'), true);
  assert.equal(source.includes("FeedUrlActions"), true);
  assert.equal(source.includes("<FeedUrlActions feedUrl={feedUrl} />"), true);
  assert.equal(source.includes("Demo mode ready"), false);
  assert.equal(source.includes('viewMode="workspace"'), true);
  assert.equal(source.includes('isAdmin={user.role === "ADMIN"}'), true);
  assert.equal(source.includes('user.role !== "ADMIN" ? <DeleteAccountButton /> : null'), true);
});

test("settings page exists and renders settings-only dashboard mode", () => {
  const pagePath = new URL("../src/app/app/settings/page.tsx", import.meta.url);
  assert.equal(existsSync(pagePath), true);

  const source = readFileSync(pagePath, "utf8");
  assert.equal(source.includes('href="/app"'), true);
  assert.equal(source.includes('href="/app/feedback"'), true);
  assert.equal(source.includes('viewMode="settings"'), true);
  assert.equal(source.includes('isAdmin={user.role === "ADMIN"}'), true);
  assert.equal(source.includes('user.role !== "ADMIN" ? <DeleteAccountButton /> : null'), true);
});

test("feedback page exists and keeps message as the first field", () => {
  const source = readFileSync(new URL("../src/components/feedback-form.tsx", import.meta.url), "utf8");
  const messageIndex = source.indexOf("Your feedback *");
  const typeIndex = source.indexOf("Type (optional)");
  const areaIndex = source.indexOf("Feature area (optional)");
  assert.equal(messageIndex > -1, true);
  assert.equal(typeIndex > -1, true);
  assert.equal(areaIndex > -1, true);
  assert.equal(messageIndex < typeIndex, true);
  assert.equal(typeIndex < areaIndex, true);
  assert.equal(source.includes("You may contact me by email about this feedback"), true);
});

test("dashboard client gates markdown controls to admins", () => {
  const source = readFileSync(new URL("../src/components/dashboard-client.tsx", import.meta.url), "utf8");
  assert.equal(source.includes("isAdmin = false"), true);
  assert.equal(source.includes("{isAdmin ? ("), true);
  assert.equal(source.includes("{showItemsSection && isAdmin && markdownPreview ? ("), true);
});

test("dashboard client includes chrome web store install CTA and extension controls in workspace", () => {
  const source = readFileSync(new URL("../src/components/dashboard-client.tsx", import.meta.url), "utf8");
  assert.equal(source.includes("https://chromewebstore.google.com/detail/articlepod-capture/epjncnckcohefbopcbpfppfgljkkcmgp"), true);
  assert.equal(source.includes("Add to Chrome (Chrome Web Store)"), true);
  assert.equal(source.includes("Open extension settings"), false);
  assert.equal(source.includes("const showExtensionSection = !readOnly;"), true);
});

test("login redirects admins directly to admin dashboard", () => {
  const source = readFileSync(new URL("../src/app/login/page.tsx", import.meta.url), "utf8");
  assert.equal(source.includes('router.push(json.role === "ADMIN" ? "/admin" : "/app")'), true);
});
