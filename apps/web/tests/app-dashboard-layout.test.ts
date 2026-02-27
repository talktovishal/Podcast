import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("app dashboard links to settings and keeps compact feed visibility", () => {
  const source = readFileSync(new URL("../src/app/app/page.tsx", import.meta.url), "utf8");

  assert.equal(source.includes('href="/app/settings"'), true);
  assert.equal(source.includes("Private feed URL"), true);
  assert.equal(source.includes('viewMode="workspace"'), true);
  assert.equal(source.includes('user.role !== "ADMIN" ? <DeleteAccountButton /> : null'), true);
});

test("settings page exists and renders settings-only dashboard mode", () => {
  const pagePath = new URL("../src/app/app/settings/page.tsx", import.meta.url);
  assert.equal(existsSync(pagePath), true);

  const source = readFileSync(pagePath, "utf8");
  assert.equal(source.includes('href="/app"'), true);
  assert.equal(source.includes('viewMode="settings"'), true);
  assert.equal(source.includes('user.role !== "ADMIN" ? <DeleteAccountButton /> : null'), true);
});

test("login redirects admins directly to admin dashboard", () => {
  const source = readFileSync(new URL("../src/app/login/page.tsx", import.meta.url), "utf8");
  assert.equal(source.includes('router.push(json.role === "ADMIN" ? "/admin" : "/app")'), true);
});
