import {
  test as baseTest,
  expect,
  loginViaUI,
  loginAsDemo,
  logout,
  TEST_PASSWORD,
  TEST_NAME,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  trackTestUser,
} from "./helpers";

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
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    await expect(page.getByText("Recent items")).toBeVisible();
  });

  test("pressing Enter in the auth form submits login", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.locator("input[type='email']").fill(DEMO_EMAIL);
    await page.locator("input[type='password']").fill(DEMO_PASSWORD);
    await page.locator("input[type='password']").press("Enter");

    await page.waitForURL(/\/(app|admin)/, { timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.locator("input[type='email']").fill(DEMO_EMAIL);
    const passwordInput = page.locator("input[type='password']");
    await passwordInput.fill("wrongpassword123");
    await page
      .locator("button.w-full", { hasText: "Log in with email" })
      .click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(passwordInput).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#auth-password-error")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("logout redirects to root auth landing page", async ({ browser }) => {
    // Use a fresh context with stored demo auth to avoid hitting login rate limit
    const context = await browser.newContext({
      storageState: "e2e/.auth/demo.json",
    });
    const page = await context.newPage();
    await page.goto("/app");
    await page.waitForURL(/\/app/, { timeout: 10_000 });
    await logout(page);
    expect(new URL(page.url()).pathname).toBe("/");

    await page.goto("/app");
    await page.waitForURL(
      (url) => url.pathname === "/" && url.searchParams.get("next") === "/app",
    );
    await context.close();
  });
});
