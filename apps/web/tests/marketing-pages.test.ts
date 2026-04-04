import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { marketingNavItems } from "../src/lib/marketing-content";

const marketingAppRoot = "../src/app/(marketing)";

test("public marketing pages exist for all nav routes", () => {
  for (const item of marketingNavItems) {
    const pagePath = new URL(`${marketingAppRoot}${item.href}/page.tsx`, import.meta.url);
    assert.equal(existsSync(pagePath), true, `missing page for route ${item.href}`);
  }
});

test("marketing layout owns the shared header and footer CTA", () => {
  const layoutSource = readFileSync(new URL(`${marketingAppRoot}/layout.tsx`, import.meta.url), "utf8");
  const ctaSource = readFileSync(new URL("../src/components/marketing-cta.tsx", import.meta.url), "utf8");
  assert.equal(layoutSource.includes("MarketingHeader"), true);
  assert.equal(layoutSource.includes("MarketingCta"), true);
  assert.equal(layoutSource.includes('h-[100dvh]'), true);
  assert.equal(layoutSource.includes("overflow-hidden"), true);
  assert.equal(layoutSource.includes("overflow-y-auto"), true);
  assert.equal(ctaSource.includes("Footer call to action"), true);
  assert.equal(ctaSource.includes('href="/pricing"'), true);
});

test("secondary marketing pages stay content-only while the layout supplies shared chrome", () => {
  for (const item of marketingNavItems) {
    const source = readFileSync(new URL(`${marketingAppRoot}${item.href}/page.tsx`, import.meta.url), "utf8");
    assert.equal(source.includes("MarketingHeader"), false, `page-local header should be removed on ${item.href}`);
    assert.equal(source.includes("MarketingCta"), false, `page-local CTA should be removed on ${item.href}`);
    assert.equal(source.includes("MarketingFooter"), false, `duplicate footer chrome still present on ${item.href}`);
    assert.equal(source.includes('inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5]'), false, `duplicate hero pill should be removed on ${item.href}`);
  }
});

test("login nav has no placeholder links", () => {
  const source = readFileSync(new URL("../src/components/auth-landing-page.tsx", import.meta.url), "utf8");
  assert.equal(source.includes('href="#"'), false);
});

test("root homepage renders the shared auth landing page for signed-out visitors", () => {
  const source = readFileSync(new URL(`${marketingAppRoot}/page.tsx`, import.meta.url), "utf8");
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
  assert.equal(source.includes("MarketingHeader"), false);
  assert.equal(source.includes("MarketingCta"), false);
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
