import { test, expect } from "./helpers";
import type { Page } from "@playwright/test";

async function expectRssXml(page: Page, xml: string): Promise<void> {
  const structure = await page.evaluate((body) => {
    const document = new DOMParser().parseFromString(body, "application/xml");
    const root = document.documentElement;
    return {
      parseErrors: document.querySelectorAll("parsererror").length,
      root: root.tagName,
      version: root.getAttribute("version"),
      channels: Array.from(root.children).filter((child) => child.tagName === "channel").length
    };
  }, xml);
  expect(structure).toEqual({ parseErrors: 0, root: "rss", version: "2.0", channels: 1 });
}

test.describe("RSS Feed Integration", () => {
  test("authenticated user's feed URL returns valid RSS XML", async ({ page, request }) => {
    await page.goto("/app/podcast-apps");
    const feedControl = page.getByRole("button", { name: "Copy Private feed URL", exact: true });
    await expect(feedControl).toBeVisible();
    const feedValue = feedControl.locator("code");
    await expect(feedValue).toHaveText(/^https?:\/\/\S+\/rss\/[a-zA-Z0-9_-]+\.xml$/);
    const feedUrl = new URL((await feedValue.innerText()).trim(), page.url());
    expect(feedUrl.origin).toBe(new URL(page.url()).origin);

    const response = await request.get(feedUrl.toString());
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/xml|rss/);
    await expectRssXml(page, await response.text());
  });

  test("RSS validation accepts a valid empty feed", async ({ page }) => {
    await expectRssXml(page, '<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture</title></channel></rss>');
  });

  for (const [name, xml] of [
    ["malformed XML", '<rss version="2.0"><channel></rss>'],
    ["HTML containing RSS-shaped text", '<html><body>&lt;rss&gt;&lt;channel&gt;</body></html>'],
    ["missing channel", '<rss version="2.0"></rss>']
  ]) {
    test(`RSS validation rejects ${name}`, async ({ page }) => {
      await expect(expectRssXml(page, xml)).rejects.toThrow();
    });
  }
});
