import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { marketingNavItems } from "../src/lib/marketing-content";

test("public marketing pages exist for all nav routes", () => {
  for (const item of marketingNavItems) {
    const pagePath = new URL(`../src/app${item.href}/page.tsx`, import.meta.url);
    assert.equal(existsSync(pagePath), true, `missing page for route ${item.href}`);
  }
});

test("login nav has no placeholder links", () => {
  const source = readFileSync(new URL("../src/app/login/page.tsx", import.meta.url), "utf8");
  assert.equal(source.includes('href="#"'), false);
});
