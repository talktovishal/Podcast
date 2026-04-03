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

test("secondary marketing pages keep the shared header and CTA without a duplicate footer", () => {
  for (const item of marketingNavItems) {
    const source = readFileSync(new URL(`../src/app${item.href}/page.tsx`, import.meta.url), "utf8");
    assert.equal(source.includes("MarketingHeader"), true, `missing shared header on ${item.href}`);
    assert.equal(source.includes("MarketingCta"), true, `missing CTA on ${item.href}`);
    assert.equal(source.includes("MarketingFooter"), false, `duplicate footer chrome still present on ${item.href}`);
  }
});

test("login nav has no placeholder links", () => {
  const source = readFileSync(new URL("../src/components/auth-landing-page.tsx", import.meta.url), "utf8");
  assert.equal(source.includes('href="#"'), false);
});

test("root homepage renders the shared auth landing page for signed-out visitors", () => {
  const source = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  assert.equal(source.includes('redirect("/login")'), false);
  assert.equal(source.includes("AuthLandingPage"), true);
  assert.equal(source.includes('path: "/"'), true);
});

test("auth landing page keeps auth card structure and trims duplicate marketing chrome", () => {
  const source = readFileSync(new URL("../src/components/auth-landing-page.tsx", import.meta.url), "utf8");
  assert.equal(source.includes("Log in to your private podcast feed"), true);
  assert.equal(source.includes("Continue to your feed"), false);
  assert.equal(source.includes("First time? We&apos;ll create your account automatically."), true);
  assert.equal(source.includes("Use email instead"), true);
  assert.equal(source.includes("Join Now"), false);
  assert.equal(source.includes("MarketingFooter"), false);
  assert.equal(source.includes("Private Knowledge Feed"), false);
  assert.equal(source.includes("Listening now"), false);
  assert.equal(source.includes("A private feed built for real catch-up time."), false);
  assert.equal(source.includes("Built for people who save more than they can revisit."), false);
});

test("login route is a compatibility redirect to root", () => {
  const source = readFileSync(new URL("../src/app/login/page.tsx", import.meta.url), "utf8");
  assert.equal(source.includes("redirect(query ? `/?${query}` : \"/\")"), true);
});
