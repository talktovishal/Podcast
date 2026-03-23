import { test as baseTest, expect, loginViaUI, loginAsDemo, logout, TEST_PASSWORD, TEST_NAME, DEMO_EMAIL, trackTestUser } from "./helpers";

// Auth tests need a clean (unauthenticated) browser context
const test = baseTest.extend({
  storageState: async ({}, use) => {
    await use({ cookies: [], origins: [] });
  },
});

test.describe("Authentication Flows", () => {
  test("sign up creates a new account and lands on /app", async ({ page }) => {
    const uniqueEmail = `e2e-${Date.now()}@articlepod.local`;
    await loginViaUI(page, {
      email: uniqueEmail,
      password: TEST_PASSWORD,
      name: TEST_NAME,
      mode: "signup",
    });

    expect(page.url()).toContain("/app");
    await expect(page.getByText(TEST_NAME)).toBeVisible();

    // Track for cleanup teardown
    trackTestUser(uniqueEmail, TEST_PASSWORD);
  });

  test("login with demo credentials lands on /app", async ({ page }) => {
    await loginAsDemo(page);
    expect(page.url()).toContain("/app");
    await expect(page.getByText("Signed in as")).toBeVisible();
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.locator("input[type='email']").fill(DEMO_EMAIL);
    await page.locator("input[type='password']").fill("wrongpassword123");
    await page.locator("button.w-full", { hasText: "Log in with email" }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });

  test("logout redirects to /login", async ({ browser }) => {
    // Use a fresh context with stored demo auth to avoid hitting login rate limit
    const context = await browser.newContext({
      storageState: "e2e/.auth/demo.json",
    });
    const page = await context.newPage();
    await page.goto("/app");
    await page.waitForURL(/\/app/, { timeout: 10_000 });
    await logout(page);
    expect(page.url()).toContain("/login");

    await page.goto("/app");
    await page.waitForURL(/\/login/);
    await context.close();
  });
});
