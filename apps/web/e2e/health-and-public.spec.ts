import { test as baseTest, expect } from "@playwright/test";

// Public page tests need a clean (unauthenticated) browser context
const test = baseTest.extend({
  storageState: async ({}, use) => {
    await use({ cookies: [], origins: [] });
  },
});

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
});
