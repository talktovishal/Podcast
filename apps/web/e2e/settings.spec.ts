import { test, expect } from "./helpers";

test.describe("Settings Page", () => {
  test("settings page loads and shows account info", async ({ page }) => {
    await page.goto("/app/settings");
    await page.waitForURL(/\/app\/settings/);

    await expect(page.getByText("Account settings")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to episodes" })).toBeVisible();
  });

  test("settings page shows voice selection section", async ({ page }) => {
    await page.goto("/app/settings");
    await page.waitForURL(/\/app\/settings/);

    await expect(page.getByText(/voice/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("can navigate back to dashboard from settings", async ({ page }) => {
    await page.goto("/app/settings");
    await page.waitForURL(/\/app\/settings/);

    await page.getByRole("link", { name: "Back to episodes" }).click();
    await page.waitForURL(/\/app$/);
  });
});
