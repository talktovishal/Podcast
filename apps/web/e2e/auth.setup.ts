import { test as setup, expect } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./helpers";

const AUTH_FILE = "e2e/.auth/demo.json";

setup("authenticate as demo user", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.locator("input[type='email']").fill(DEMO_EMAIL);
  await page.locator("input[type='password']").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Log in with email" }).click();

  await page.waitForURL(/\/(app|admin)/, { timeout: 15_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
