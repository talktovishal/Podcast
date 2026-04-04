import { test as baseTest, expect } from "@playwright/test";

// Public page tests need a clean (unauthenticated) browser context
const test = baseTest.extend({
  storageState: async ({}, use) => {
    await use({ cookies: [], origins: [] });
  },
});

const secondaryMarketingPages = [
  {
    path: "/product",
    heading: "One system for continuous learning",
    secondaryCta: "See pricing"
  },
  {
    path: "/pricing",
    heading: "Simple pricing for personal listening",
    secondaryCta: "See pricing"
  },
  {
    path: "/resources",
    heading: "Save in Chrome. Listen in the podcast app you already use.",
    secondaryCta: "See pricing"
  },
  {
    path: "/faq",
    heading: "Answers to common questions",
    secondaryCta: "See pricing"
  },
  {
    path: "/about",
    heading: "Listen to your reading list and finally catch up on what matters",
    secondaryCta: "See pricing"
  }
] as const;

test.describe("Health & Public Pages", () => {
  test("health endpoint returns ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("root renders the public auth landing page when unauthenticated", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: "Log in to your private podcast feed" })
    ).toBeVisible();
  });

  test("/login redirects back to the root auth landing page", async ({ page }) => {
    await page.goto("/login?next=%2Fpricing");
    await page.waitForURL((url) => url.pathname === "/" && url.searchParams.get("next") === "/pricing");
    await expect(
      page.getByRole("heading", { name: "Log in to your private podcast feed" })
    ).toBeVisible();
  });

  test("root auth landing page renders with email and password fields", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in with email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });

  test("/app redirects to root auth landing page when not authenticated", async ({ page }) => {
    await page.goto("/app");
    await page.waitForURL((url) => url.pathname === "/" && url.searchParams.get("next") === "/app");
    await expect(
      page.getByRole("heading", { name: "Log in to your private podcast feed" })
    ).toBeVisible();
  });

  test("public homepage keeps a single primary navigation and a persistent footer CTA", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("navigation", { name: "Primary navigation" })
    ).toBeVisible();
    await expect(
      page.getByRole("contentinfo", { name: "Footer call to action" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Start your knowledge feed" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "See pricing" })
    ).toBeVisible();
  });

  test("secondary marketing pages keep one primary nav and one persistent footer CTA on desktop", async ({ page }) => {
    for (const pageSpec of secondaryMarketingPages) {
      await page.goto(pageSpec.path);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("navigation", { name: "Primary navigation" })
      ).toBeVisible();
      await expect(
        page.getByRole("contentinfo", { name: "Footer call to action" })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 1, name: pageSpec.heading })
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Start your knowledge feed" })
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: pageSpec.secondaryCta })
      ).toBeVisible();
    }
  });

  test("secondary marketing pages keep one primary nav and one persistent footer CTA on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const pageSpec of secondaryMarketingPages) {
      await page.goto(pageSpec.path);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("navigation", { name: "Primary navigation" })
      ).toBeVisible();
      await expect(
        page.getByRole("contentinfo", { name: "Footer call to action" })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 1, name: pageSpec.heading })
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Start your knowledge feed" })
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: pageSpec.secondaryCta })
      ).toBeVisible();
    }
  });

  test("/share stays outside the persistent marketing footer chrome", async ({ page }) => {
    await page.goto("/share");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("contentinfo", { name: "Footer call to action" })
    ).toHaveCount(0);
  });
});
