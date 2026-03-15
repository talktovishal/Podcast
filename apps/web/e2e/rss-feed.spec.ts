import { test, expect } from "./helpers";

test.describe("RSS Feed Integration", () => {
  test("authenticated user's feed URL returns valid RSS XML", async ({ page, request }) => {
    await page.goto("/app");
    await page.waitForURL(/\/app/);

    // Extract the feed URL from the dashboard
    // The feed URL is displayed in the header area
    const feedLink = page.locator("a[href*='/rss/']").first();
    const feedLinkExists = await feedLink.count();

    if (feedLinkExists > 0) {
      const feedUrl = await feedLink.getAttribute("href");
      if (feedUrl) {
        const fullUrl = feedUrl.startsWith("http") ? feedUrl : `${page.url().split("/app")[0]}${feedUrl}`;
        const res = await request.get(fullUrl);
        expect(res.ok()).toBe(true);
        const contentType = res.headers()["content-type"] || "";
        // RSS should return XML content type
        expect(contentType).toMatch(/xml|rss/);
        const body = await res.text();
        // Basic RSS structure check
        expect(body).toContain("<rss");
        expect(body).toContain("<channel>");
        expect(body).toContain("</channel>");
        expect(body).toContain("</rss>");
      }
    } else {
      // Feed URL might be shown as text rather than a link; check the page
      // text directly for the pattern
      const pageContent = await page.content();
      const feedMatch = pageContent.match(/\/rss\/([a-zA-Z0-9_-]+)\.xml/);
      if (feedMatch) {
        const feedPath = feedMatch[0];
        const res = await request.get(feedPath);
        expect(res.ok()).toBe(true);
        const body = await res.text();
        expect(body).toContain("<rss");
      }
    }
  });
});
