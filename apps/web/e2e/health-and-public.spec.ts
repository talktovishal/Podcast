import { test as baseTest, expect } from "@playwright/test";

// Public page tests need a clean (unauthenticated) browser context
const test = baseTest.extend({
  storageState: async ({}, use) => {
    await use({ cookies: [], origins: [] });
  },
});

const secondaryMarketingPages = [
  {
    path: "/product",
    heading: "One system for continuous learning",
    secondaryCta: "See pricing",
  },
  {
    path: "/pricing",
    heading: "Choose the ArticlePod plan that fits how you save and learn.",
    secondaryCta: "See pricing",
  },
  {
    path: "/resources",
    heading: "Save in Chrome. Listen in the podcast app you already use.",
    secondaryCta: "See pricing",
  },
  {
    path: "/faq",
    heading: "Common questions, answered",
    secondaryCta: "See pricing",
  },
  {
    path: "/about",
    heading: "Listen to your reading list and finally catch up on what matters",
    secondaryCta: "See pricing",
  },
] as const;

test.describe("Health & Public Pages", () => {
  test("health endpoint returns ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("root renders the public auth landing page when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", {
        name: "Log in to your private podcast feed",
      }),
    ).toBeVisible();
  });

  test("/login redirects back to the root auth landing page", async ({
    page,
  }) => {
    await page.goto("/login?next=%2Fpricing");
    await page.waitForURL(
      (url) =>
        url.pathname === "/" && url.searchParams.get("next") === "/pricing",
    );
    await expect(
      page.getByRole("heading", {
        name: "Log in to your private podcast feed",
      }),
    ).toBeVisible();
  });

  test("root auth landing page renders with email and password fields", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Log in with email" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create account" }),
    ).toBeVisible();
  });

  test("/app redirects to root auth landing page when not authenticated", async ({
    page,
  }) => {
    await page.goto("/app");
    await page.waitForURL(
      (url) => url.pathname === "/" && url.searchParams.get("next") === "/app",
    );
    await expect(
      page.getByRole("heading", {
        name: "Log in to your private podcast feed",
      }),
    ).toBeVisible();
  });

  test("public homepage keeps a single primary navigation and a persistent footer CTA", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeVisible();
    await expect(
      page.getByRole("contentinfo", { name: "Footer call to action" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Start your knowledge feed" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "See pricing" })).toBeVisible();
  });

  test("secondary marketing pages keep one primary nav and one persistent footer CTA on desktop", async ({
    page,
  }) => {
    for (const pageSpec of secondaryMarketingPages) {
      await page.goto(pageSpec.path);
      await page.waitForLoadState("networkidle");
      const footerCta = page.getByRole("contentinfo", {
        name: "Footer call to action",
      });
      await expect(
        page.getByRole("navigation", { name: "Primary navigation" }),
      ).toBeVisible();
      await expect(footerCta).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 1, name: pageSpec.heading }),
      ).toBeVisible();
      await expect(
        footerCta.getByRole("link", { name: "Start your knowledge feed" }),
      ).toBeVisible();
      await expect(
        footerCta.getByRole("link", { name: pageSpec.secondaryCta }),
      ).toBeVisible();
    }
  });

  test("secondary marketing pages keep one primary nav and one persistent footer CTA on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const pageSpec of secondaryMarketingPages) {
      await page.goto(pageSpec.path);
      await page.waitForLoadState("networkidle");
      const footerCta = page.getByRole("contentinfo", {
        name: "Footer call to action",
      });
      await expect(
        page.getByRole("navigation", { name: "Primary navigation" }),
      ).toBeVisible();
      await expect(footerCta).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 1, name: pageSpec.heading }),
      ).toBeVisible();
      await expect(
        footerCta.getByRole("link", { name: "Start your knowledge feed" }),
      ).toBeVisible();
      await expect(
        footerCta.getByRole("link", { name: pageSpec.secondaryCta }),
      ).toBeVisible();
    }
  });

  test("/pricing uses standard page scrolling instead of a nested main scroll pane", async ({
    page,
  }) => {
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main");
    await expect(page.getByRole("banner")).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 300));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);

    expect(await main.evaluate((element) => element.scrollTop)).toBe(0);
  });

  test("public marketing header and footer stay pinned during page scroll", async ({
    page,
  }) => {
    await page.goto("/about");
    await page.waitForLoadState("networkidle");

    const header = page.getByRole("banner");
    const footer = page.getByRole("contentinfo", {
      name: "Footer call to action",
    });
    const before = await Promise.all([
      header.boundingBox(),
      footer.boundingBox(),
    ]);

    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(150);

    const after = await Promise.all([
      header.boundingBox(),
      footer.boundingBox(),
    ]);

    const [headerBefore, footerBefore] = before;
    const [headerAfter, footerAfter] = after;

    expect(headerBefore).not.toBeNull();
    expect(footerBefore).not.toBeNull();
    expect(headerAfter).not.toBeNull();
    expect(footerAfter).not.toBeNull();

    expect(Math.abs((headerAfter?.y ?? 0) - (headerBefore?.y ?? 0))).toBeLessThan(4);
    expect(Math.abs((footerAfter?.y ?? 0) - (footerBefore?.y ?? 0))).toBeLessThan(4);
  });

  test("mobile marketing chrome keeps nav items and footer actions on single rows", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/product");
    await page.waitForLoadState("networkidle");

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const cta = page.getByRole("contentinfo", {
      name: "Footer call to action",
    });
    const navLinks = await Promise.all([
      nav.getByRole("link", { name: "Product", exact: true }).boundingBox(),
      nav.getByRole("link", { name: "Pricing", exact: true }).boundingBox(),
      nav.getByRole("link", { name: "Resources", exact: true }).boundingBox(),
      nav.getByRole("link", { name: "FAQ", exact: true }).boundingBox(),
      nav.getByRole("link", { name: "About", exact: true }).boundingBox(),
    ]);
    const ctaLinks = await Promise.all([
      cta
        .getByRole("link", { name: "Start your knowledge feed" })
        .boundingBox(),
      cta.getByRole("link", { name: "See pricing" }).boundingBox(),
    ]);

    const navTops = navLinks.map((box) => box?.y ?? -1);
    const ctaTops = ctaLinks.map((box) => box?.y ?? -1);
    expect(Math.max(...navTops) - Math.min(...navTops)).toBeLessThan(4);
    expect(Math.max(...ctaTops) - Math.min(...ctaTops)).toBeLessThan(4);
  });

  test("desktop marketing footer keeps CTA actions side by side", async ({
    page,
  }) => {
    await page.goto("/about");
    await page.waitForLoadState("networkidle");

    const cta = page.getByRole("contentinfo", {
      name: "Footer call to action",
    });
    const ctaLinks = await Promise.all([
      cta
        .getByRole("link", { name: "Start your knowledge feed" })
        .boundingBox(),
      cta.getByRole("link", { name: "See pricing" }).boundingBox(),
    ]);

    const ctaTops = ctaLinks.map((box) => box?.y ?? -1);
    expect(Math.max(...ctaTops) - Math.min(...ctaTops)).toBeLessThan(4);
  });

  test("/resources keeps the Chrome extension walkthrough aligned and compact on desktop", async ({
    page,
  }) => {
    await page.goto("/resources");
    await page.waitForLoadState("networkidle");

    const chromeSection = page.locator("#chrome-extension");
    const label = chromeSection.getByText("Chrome extension", { exact: true });
    const image = chromeSection.getByAltText(
      "Animated walkthrough of the ArticlePod Chrome extension connect and capture flow.",
    );
    const [sectionBox, labelBox, imageBox] = await Promise.all([
      chromeSection.boundingBox(),
      label.boundingBox(),
      image.boundingBox(),
    ]);

    expect(sectionBox).not.toBeNull();
    expect(labelBox).not.toBeNull();
    expect(imageBox).not.toBeNull();

    const sectionWidth = sectionBox?.width ?? 0;
    const labelTop = labelBox?.y ?? 0;
    const imageTop = imageBox?.y ?? 0;
    const imageWidth = imageBox?.width ?? 0;

    expect(Math.abs(labelTop - imageTop)).toBeLessThan(48);
    expect(imageWidth).toBeLessThan(sectionWidth * 0.45);
  });

  test("/faq keeps quick answers while removing extra FAQ chrome", async ({
    page,
  }) => {
    await page.goto("/faq");
    await page.waitForLoadState("networkidle");
    const quickAnswers = page.locator(
      'section[aria-labelledby="faq-quick-answers"]',
    );

    await expect(
      page.getByRole("heading", { level: 2, name: "Quick answers" }),
    ).toBeVisible();
    await expect(quickAnswers.getByText(/^Getting started$/)).toBeVisible();
    await expect(quickAnswers.getByText(/^Inputs & capture$/)).toBeVisible();
    await expect(quickAnswers.getByText(/^Privacy & feed$/)).toBeVisible();
    await expect(quickAnswers.getByText(/^Podcast apps$/)).toBeVisible();
    await expect(
      quickAnswers.getByText("One save becomes one episode"),
    ).toBeVisible();
    await expect(
      quickAnswers.getByText("Private feed URL you control"),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Getting started" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Inputs & capture" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Privacy & feed" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Podcast apps" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Account & access" }),
    ).toBeVisible();
    await expect(page.getByText("Browse by topic")).toHaveCount(0);
    await expect(page.getByText("Need something specific?")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Link" })).toHaveCount(0);

    const privacyQuickAnswer = page.getByRole("link", {
      name: /Private feed URL you control/i,
    });
    await expect(privacyQuickAnswer).toBeVisible();
    await privacyQuickAnswer.click();
    await expect(page).toHaveURL(/\/faq#privacy-feed$/);

    await page.getByRole("button", { name: "Is my feed private?" }).click();
    await expect(
      page.getByRole("button", { name: "Is my feed private?" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(page).toHaveURL(/\/faq#question-private-feed$/);

    await page.goto("/faq#question-rotate-feed-url");
    await page.waitForLoadState("networkidle");
    const rotateQuestion = page.getByRole("button", {
      name: "What happens if I need to rotate my feed URL?",
    });
    await expect(rotateQuestion).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByText("Rotation invalidates the old URL."),
    ).toBeVisible();
  });

  test("/share stays outside the persistent marketing footer chrome", async ({
    page,
  }) => {
    await page.goto("/share");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("contentinfo", { name: "Footer call to action" }),
    ).toHaveCount(0);
  });

  test("unknown public paths render a proper not-found page instead of redirecting home", async ({
    page,
  }) => {
    const response = await page.goto("/nonexistent");
    await page.waitForLoadState("networkidle");

    expect(response?.status()).toBe(404);
    await expect(page).toHaveURL(/\/nonexistent$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "That URL does not match a public page in ArticlePod. Check the address or head back to a page you know.",
      ),
    ).toBeVisible();
  });
});
