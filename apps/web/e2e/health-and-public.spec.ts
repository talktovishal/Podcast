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
    secondaryCta: "Explore product"
  },
  {
    path: "/resources",
    heading: "Chrome Extension",
    secondaryCta: "Read the FAQ"
  },
  {
    path: "/faq",
    heading: "Answers to common questions",
    secondaryCta: "Set up the extension"
  },
  {
    path: "/about",
    heading: "Built for people who save more than they can revisit",
    secondaryCta: "See how it works"
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

  test("public homepage keeps a single primary navigation and no footer navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("navigation", { name: "Primary navigation" })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Footer navigation" })
    ).toHaveCount(0);
  });

  test("secondary marketing pages keep one primary nav, no footer nav, and visible CTAs on desktop", async ({ page }) => {
    for (const pageSpec of secondaryMarketingPages) {
      await page.goto(pageSpec.path);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("navigation", { name: "Primary navigation" })
      ).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Footer navigation" })
      ).toHaveCount(0);
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

  test("secondary marketing pages keep one primary nav, no footer nav, and visible CTAs on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const pageSpec of secondaryMarketingPages) {
      await page.goto(pageSpec.path);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("navigation", { name: "Primary navigation" })
      ).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Footer navigation" })
      ).toHaveCount(0);
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
});
