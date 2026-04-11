import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { marketingNavItems } from "../src/lib/marketing-content";

const marketingAppRoot = "../src/app/(marketing)";

test("public marketing pages exist for all nav routes", () => {
  for (const item of marketingNavItems) {
    const pagePath = new URL(
      `${marketingAppRoot}${item.href}/page.tsx`,
      import.meta.url,
    );
    assert.equal(
      existsSync(pagePath),
      true,
      `missing page for route ${item.href}`,
    );
  }
});

test("marketing layout owns the shared header and footer CTA", () => {
  const layoutSource = readFileSync(
    new URL(`${marketingAppRoot}/layout.tsx`, import.meta.url),
    "utf8",
  );
  const ctaSource = readFileSync(
    new URL("../src/components/marketing-cta.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(layoutSource.includes("MarketingHeader"), true);
  assert.equal(layoutSource.includes("MarketingCta"), true);
  assert.equal(layoutSource.includes("min-h-screen"), true);
  assert.equal(layoutSource.includes("w-full"), true);
  assert.equal(layoutSource.includes("sticky top-0"), true);
  assert.equal(layoutSource.includes("overflow-hidden"), false);
  assert.equal(layoutSource.includes("overflow-y-auto"), false);
  assert.equal(layoutSource.includes("overscroll-y-contain"), false);
  assert.equal(layoutSource.includes("py-2 sm:py-4"), true);
  assert.equal(layoutSource.includes("py-4 sm:py-8"), true);
  assert.equal(ctaSource.includes("Footer call to action"), true);
  assert.equal(ctaSource.includes("grid grid-cols-2 items-center gap-2"), true);
  assert.equal(ctaSource.includes("sm:flex sm:flex-wrap sm:gap-3"), true);
  assert.equal(ctaSource.includes('href="/pricing"'), true);
});

test("site-wide not-found page uses shared marketing chrome and clear recovery links", () => {
  const source = readFileSync(
    new URL("../src/app/not-found.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(source.includes("MarketingHeader"), true);
  assert.equal(source.includes("MarketingCta"), true);
  assert.equal(source.includes("Page not found"), true);
  assert.equal(source.includes('href="/"'), true);
  assert.equal(source.includes('href="/pricing"'), true);
});

test("secondary marketing pages stay content-only while the layout supplies shared chrome", () => {
  for (const item of marketingNavItems) {
    const source = readFileSync(
      new URL(`${marketingAppRoot}${item.href}/page.tsx`, import.meta.url),
      "utf8",
    );
    assert.equal(
      source.includes("MarketingHeader"),
      false,
      `page-local header should be removed on ${item.href}`,
    );
    assert.equal(
      source.includes("MarketingCta"),
      false,
      `page-local CTA should be removed on ${item.href}`,
    );
    assert.equal(
      source.includes("MarketingFooter"),
      false,
      `duplicate footer chrome still present on ${item.href}`,
    );
    assert.equal(
      source.includes(
        "inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5]",
      ),
      false,
      `duplicate hero pill should be removed on ${item.href}`,
    );
  }
});

test("resources page keeps the Chrome extension walkthrough compact on desktop", () => {
  const source = readFileSync(
    new URL(`${marketingAppRoot}/resources/page.tsx`, import.meta.url),
    "utf8",
  );

  assert.equal(
    source.includes(
      "lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.85fr)] lg:items-start lg:gap-8",
    ),
    true,
  );
  assert.equal(source.includes("lg:max-w-[34rem]"), true);
  assert.equal(source.includes("lg:max-w-[25rem]"), true);
  assert.equal(
    source.includes(
      "rounded-[1.75rem] border border-[rgba(31,122,90,0.16)]",
    ),
    true,
  );
  assert.equal(
    source.includes(
      "overflow-hidden rounded-xl border border-slate-200 bg-slate-50",
    ),
    false,
  );
});

test("login nav has no placeholder links", () => {
  const source = readFileSync(
    new URL("../src/components/auth-landing-page.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes('href="#"'), false);
});

test("root homepage renders the shared auth landing page for signed-out visitors", () => {
  const source = readFileSync(
    new URL(`${marketingAppRoot}/page.tsx`, import.meta.url),
    "utf8",
  );
  assert.equal(source.includes('redirect("/login")'), false);
  assert.equal(source.includes("AuthLandingPage"), true);
  assert.equal(source.includes('path: "/"'), true);
});

test("auth landing page keeps auth card structure and trims duplicate marketing chrome", () => {
  const source = readFileSync(
    new URL("../src/components/auth-landing-page.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes("Log in to your private podcast feed"), true);
  assert.equal(source.includes("Continue to your feed"), false);
  assert.equal(
    source.includes(
      "First time? We&apos;ll create your account automatically.",
    ),
    true,
  );
  assert.equal(source.includes("resolveAuthErrorState"), true);
  assert.equal(source.includes('aria-invalid={fieldHasError("email")}'), true);
  assert.equal(
    source.includes('aria-invalid={fieldHasError("password")}'),
    true,
  );
  assert.equal(source.includes("id={fieldErrorIds.password}"), true);
  assert.equal(source.includes('role="alert"'), true);
  assert.equal(source.includes("Use email instead"), false);
  assert.equal(source.includes("Already have an email account?"), false);
  assert.equal(source.includes("Need a new account?"), false);
  assert.equal(source.includes("<span>OR</span>"), true);
  assert.equal(source.includes("Join Now"), false);
  assert.equal(source.includes("MarketingHeader"), false);
  assert.equal(source.includes("MarketingCta"), false);
  assert.equal(source.includes("MarketingFooter"), false);
  assert.equal(source.includes("Private Knowledge Feed"), false);
  assert.equal(source.includes("Listening now"), false);
  assert.equal(
    source.includes("A private feed built for real catch-up time."),
    false,
  );
  assert.equal(
    source.includes("Built for people who save more than they can revisit."),
    false,
  );
});

test("login route is a compatibility redirect to root", () => {
  const source = readFileSync(
    new URL("../src/app/login/page.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes('redirect(query ? `/?${query}` : "/")'), true);
});
