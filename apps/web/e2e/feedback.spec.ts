import { test, expect } from "./helpers";

test.describe("Feedback Page", () => {
  test("feedback page loads and shows form", async ({ page }) => {
    await page.goto("/app/feedback");
    await page.waitForURL(/\/app\/feedback/);

    await expect(page.getByText(/feedback/i).first()).toBeVisible();
  });
});
