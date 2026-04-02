import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { createElement } from "react";
import { MarketingFooter } from "../src/components/marketing-footer";
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

test("root homepage continues redirecting unauthenticated users to login", () => {
  const source = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  assert.equal(source.includes('redirect("/login")'), true);
});

test("login homepage keeps auth card structure and avoids extra top auth buttons", () => {
  const source = readFileSync(new URL("../src/app/login/page.tsx", import.meta.url), "utf8");
  assert.equal(source.includes("Continue to your feed"), true);
  assert.equal(source.includes("Use email instead"), true);
  assert.equal(source.includes("Join Now"), false);
  assert.equal(source.includes("MarketingFooter"), true);
  assert.equal(source.includes("BRAND_PODCAST_COVER_PATH"), true);
});

test("marketing footer omits contact when contact email is unset", () => {
  const previous = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  delete process.env.NEXT_PUBLIC_CONTACT_EMAIL;

  try {
    const markup = renderToStaticMarkup(createElement(MarketingFooter));
    assert.equal(markup.includes("Product"), true);
    assert.equal(markup.includes("Pricing"), true);
    assert.equal(markup.includes("Contact"), false);
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_CONTACT_EMAIL;
    } else {
      process.env.NEXT_PUBLIC_CONTACT_EMAIL = previous;
    }
  }
});

test("marketing footer includes contact when contact email is configured", () => {
  const previous = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  process.env.NEXT_PUBLIC_CONTACT_EMAIL = "hello@articlepod.com";

  try {
    const markup = renderToStaticMarkup(createElement(MarketingFooter));
    assert.equal(markup.includes("Contact"), true);
    assert.equal(markup.includes('href="mailto:hello@articlepod.com"'), true);
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_CONTACT_EMAIL;
    } else {
      process.env.NEXT_PUBLIC_CONTACT_EMAIL = previous;
    }
  }
});
