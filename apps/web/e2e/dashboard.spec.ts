import { test, expect } from "./helpers";

test.describe("Dashboard & Item Submission", () => {
  test("dashboard shows URL submission form", async ({ page }) => {
    await page.goto("/app");
    await page.waitForURL(/\/app/);

    await expect(page.locator("input[placeholder*='example.com']")).toBeVisible();
    const submitBtn = page.getByRole("button", { name: "Submit URL" });
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeDisabled();
  });

  test("can switch between URL and PDF source modes", async ({ page }) => {
    await page.goto("/app");
    await page.waitForURL(/\/app/);

    await expect(page.locator("input[placeholder*='example.com']")).toBeVisible();

    await page.locator("label", { hasText: "Upload PDF" }).click();
    await expect(page.locator("input[type='file'][accept='application/pdf']")).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload PDF" })).toBeVisible();

    await page.locator("label", { hasText: "Paste article URL" }).click();
    await expect(page.locator("input[placeholder*='example.com']")).toBeVisible();
  });

  test("submit URL button enables when URL is provided", async ({ page }) => {
    await page.goto("/app");
    await page.waitForURL(/\/app/);

    const urlInput = page.locator("input[placeholder*='example.com']");
    const submitBtn = page.getByRole("button", { name: "Submit URL" });

    await expect(submitBtn).toBeDisabled();

    await urlInput.fill("https://example.com/test-article");
    await expect(submitBtn).toBeEnabled();

    await urlInput.fill("");
    await expect(submitBtn).toBeDisabled();
  });

  test("submitting a URL creates an item and shows it in the list", async ({ page }) => {
    await page.goto("/app");
    await page.waitForURL(/\/app/);

    const testUrl = "https://example.com/e2e-test-article";
    await page.locator("input[placeholder*='example.com']").fill(testUrl);
    const revealOptionalDetails = page.getByRole("button", { name: "Show" });
    if (await revealOptionalDetails.isVisible()) {
      await revealOptionalDetails.click();
    }
    await page.locator("input[placeholder*='auto-title']").fill("E2E Test Article");

    await page.getByRole("button", { name: "Submit URL" }).click();

    await expect(page.getByText("E2E Test Article")).toBeVisible({ timeout: 15_000 });
  });

  test("dashboard header shows feed URL actions", async ({ page }) => {
    await page.goto("/app");
    await page.waitForURL(/\/app/);

    await expect(page.getByText(/rss/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("navigation links are present (Settings, Feedback, Logout)", async ({ page }) => {
    await page.goto("/app");
    await page.waitForURL(/\/app/);

    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Feedback" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  });

  test("logout returns the user to the root auth landing page", async ({ page }) => {
    await page.goto("/app");
    await page.waitForURL(/\/app/);

    await page.getByRole("button", { name: "Log out" }).click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Log in to your private podcast feed" })
    ).toBeVisible();
  });

  test("demo starter episode has playable audio and serves valid media", async ({ page, request }) => {
    await page.goto("/app");
    await page.waitForURL(/\/app/);

    // The seeded "Welcome to ArticlePod" item should have an audio element
    const audio = page.locator("audio[preload='metadata']").first();
    await expect(audio).toBeVisible({ timeout: 10_000 });

    // Verify the media src is a signed URL pointing to the media endpoint
    const src = await audio.getAttribute("src");
    expect(src).toBeTruthy();
    expect(src).toContain("/api/media/");
    expect(src).toContain("?mt="); // signed token

    // Fetch the audio file via the media URL and verify it serves valid audio
    const mediaRes = await request.get(src!);
    expect(mediaRes.ok()).toBe(true);
    const contentType = mediaRes.headers()["content-type"] || "";
    expect(contentType).toContain("audio/mpeg");
    const contentLength = parseInt(mediaRes.headers()["content-length"] || "0", 10);
    expect(contentLength).toBeGreaterThan(0);

    // Verify range request support (required for podcast app seeking)
    const rangeRes = await request.get(src!, {
      headers: { Range: "bytes=0-1" },
    });
    expect(rangeRes.status()).toBe(206);
    expect(rangeRes.headers()["content-range"]).toMatch(/^bytes 0-1\//);

    // Verify HEAD request works (podcast apps use this for Content-Length)
    const headRes = await request.head(src!);
    expect(headRes.ok()).toBe(true);
    expect(headRes.headers()["accept-ranges"]).toBe("bytes");

    // Verify the Download link is also present
    const downloadLink = page.getByRole("link", { name: "Download" }).first();
    await expect(downloadLink).toBeVisible();
  });
});
