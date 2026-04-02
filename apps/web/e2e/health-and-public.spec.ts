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

  test("root redirects to /login when unauthenticated", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain("/login");
  });

  test("login page renders with email and password fields", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Continue to your feed")).toBeVisible();
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in with email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });

  test("/app redirects to /login when not authenticated", async ({ page }) => {
    await page.goto("/app");
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain("/login");
  });
});
