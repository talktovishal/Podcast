import { test as base, type Page } from "@playwright/test";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

/**
 * Shared helpers for E2E tests:
 * - Reads credentials from environment (falls back to demo defaults).
 * - Provides a `loggedInPage` fixture that signs up a fresh test user
 *   (or logs in with existing demo creds) and yields an authenticated Page.
 */

export const TEST_EMAIL = process.env.E2E_TEST_EMAIL || "e2e-test@articlepod.local";
export const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || "e2eTestPass123!";
export const TEST_NAME = "E2E Test User";

export const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo@articlepod.local";
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "local-dev-demo";

/**
 * Sign up or log in a user via the root auth landing page UI.
 * Returns the page already on /app (dashboard).
 */
export async function loginViaUI(
  page: Page,
  opts: { email: string; password: string; name?: string; mode: "login" | "signup" }
): Promise<void> {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  if (opts.mode === "signup") {
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    if (opts.name) {
      await page.locator("label", { hasText: "Name" }).locator("input").fill(opts.name);
    }
  } else {
    await page.getByRole("button", { name: "Log in", exact: true }).click();
  }

  await page.locator("input[type='email']").fill(opts.email);
  await page.locator("input[type='password']").fill(opts.password);

  const submitLabel = opts.mode === "signup" ? "Create account with email" : "Log in with email";
  await page.locator("button.w-full", { hasText: submitLabel }).click();

  // Wait for redirect to /app or /admin
  await page.waitForURL(/\/(app|admin)/, { timeout: 15_000 });
}

/**
 * Log in with the demo account credentials (expected to already exist
 * from seed:demo).
 */
export async function loginAsDemo(page: Page): Promise<void> {
  await loginViaUI(page, { email: DEMO_EMAIL, password: DEMO_PASSWORD, mode: "login" });
}

/**
 * Log out via the Logout button on the dashboard.
 */
export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 10_000 });
}

/**
 * Custom test fixture that provides a page already logged in as
 * the demo user.
 */
export const test = base.extend<{ loggedInPage: Page }>({
  loggedInPage: async ({ page }, use) => {
    await loginAsDemo(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";

/**
 * Persist a test-created user email+password so the cleanup teardown
 * can log in and delete them.
 */
export function trackTestUser(email: string, password: string): void {
  const trackingFile = resolve(process.cwd(), "e2e/.auth/test-users.json");
  let users: Array<{ email: string; password: string }> = [];
  try {
    users = JSON.parse(readFileSync(trackingFile, "utf-8"));
  } catch {
    // file doesn't exist yet
  }
  users.push({ email, password });
  mkdirSync(dirname(trackingFile), { recursive: true });
  writeFileSync(trackingFile, JSON.stringify(users, null, 2));
}
