import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  containsBannedMarketingPhrase,
  marketingBannedPhrases,
  marketingCopy,
  marketingNavItems,
  publicMarketingSensitivePhrases,
} from "../src/lib/marketing-content";
import {
  productProofPills,
  productRecommendationCards,
  productStoryBlocks,
} from "../src/lib/product-page-content";
import {
  paidPlanCapacityDelta,
  paidPlanConfig,
} from "../src/lib/paid-plan-config";

const marketingAppRoot = "../src/app/(marketing)";

test("marketing nav items follow canonical order and routes", () => {
  assert.deepEqual(
    marketingNavItems.map((item) => item.label),
    ["Product", "Pricing", "Resources", "FAQ", "About"],
  );

  for (const item of marketingNavItems) {
    assert.ok(item.href.startsWith("/"));
    assert.notEqual(item.href, "#");
  }
});

test("marketing copy keeps concise busy-reader framing", () => {
  assert.equal(
    marketingCopy.heroHeadline,
    "The intellectual sanctuary for busy readers.",
  );
  assert.equal(
    marketingCopy.heroSubheading,
    "Archive favorite articles in a private feed and listen on the go with high-fidelity AI narration. Save URLs, PDFs, and Chrome captures, then catch up in your regular podcast app or with weekly digests.",
  );
  assert.deepEqual(
    marketingCopy.heroHighlights.map((item) => item.title),
    ["Curated archive", "Private RSS feed", "Podcast + email digests"],
  );
  assert.equal(
    marketingCopy.securityIntro,
    "Podcast access stays private across sign-in, pairing, and playback.",
  );
  assert.equal(marketingCopy.ctaPrimary, "Start your knowledge feed");
  assert.equal(marketingCopy.ctaSecondary, "See pricing");
});

test("hero copy does not include banned phrases", () => {
  const heroText = `${marketingCopy.heroHeadline} ${marketingCopy.heroSubheading}`;
  assert.equal(containsBannedMarketingPhrase(heroText), false);
  for (const phrase of marketingBannedPhrases) {
    assert.equal(heroText.toLowerCase().includes(phrase), false);
  }
});

test("security bullets has exactly three concise entries", () => {
  assert.deepEqual(marketingCopy.securityBullets, [
    "Social sign-in stays in secure server-side sessions.",
    "Chrome pairing uses a one-time code to protect your feed URL.",
    "Feed access and episode audio stay token-protected.",
  ]);
  for (const bullet of marketingCopy.securityBullets) {
    assert.ok(bullet.length > 0, "bullet must not be empty");
    assert.ok(
      bullet.length <= 120,
      `bullet too long (${bullet.length} chars): ${bullet}`,
    );
  }
});

test("auth landing page places the security section after the feature highlight cards", () => {
  const source = readFileSync(
    new URL("../src/components/auth-landing-page.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(
    source.indexOf("Private by design") >
      source.indexOf("marketingCopy.heroHighlights.map"),
  );
});

test("pricing page exposes Starter plus monthly and annual Pro choices with a comparison table and clear billing policy", () => {
  const source = readFileSync(
    new URL(`${marketingAppRoot}/pricing/page.tsx`, import.meta.url),
    "utf8",
  );
  const monthlyPlan = paidPlanConfig("PRO_MONTHLY");
  const annualPlan = paidPlanConfig("PRO_ANNUAL");
  const annualAdvantage = paidPlanCapacityDelta();

  assert.equal(
    source.includes('title: "Pricing for private article podcasts"'),
    true,
  );
  assert.equal(
    source.includes(
      "Choose the ArticlePod plan that fits how you save and learn.",
    ),
    true,
  );
  assert.equal(source.includes("$15/mo"), true);
  assert.equal(source.includes("$130/yr"), true);
  assert.equal(source.includes("Save nearly 30%"), true);
  assert.equal(
    source.includes(
      "Start free and upgrade when you need more daily episodes, manual summaries, and digest workflows.",
    ),
    true,
  );
  assert.equal(source.includes("Sign in to start free"), true);
  assert.equal(source.includes("Compare plans at a glance"), true);
  assert.equal(source.includes("<table"), true);
  assert.equal(source.includes("What to expect"), true);
  assert.equal(source.includes("Billed upfront monthly or yearly"), true);
  assert.equal(source.includes("Renews automatically until canceled"), true);
  assert.equal(
    source.includes(
      "Cancel anytime; access stays through the current paid period",
    ),
    true,
  );
  assert.equal(
    source.includes("new private podcast episodes per 24 hours"),
    true,
  );
  assert.equal(source.includes("manual summaries per 7 days"), true);
  assert.equal(source.includes("Weekly digest podcast + email options"), true);
  assert.equal(source.includes("Why Pro Annual wins"), false);
  assert.equal(source.includes("Who Starter is for"), false);
  assert.equal(source.includes("Why annual stands out"), false);
  assert.equal(source.includes("Daily podcast + email briefing"), false);
  assert.equal(source.includes("scale into Pro or Team"), false);
  assert.equal(
    source.includes('<h2 className="text-lg font-semibold">Team</h2>'),
    false,
  );
  assert.equal(source.includes("$79/mo"), false);
  assert.equal(source.includes("$19/mo"), false);
  assert.equal(source.includes("Capacity, cost, and margins"), false);
  assert.equal(source.includes("cost model details"), false);
  assert.equal(source.includes("better margin on regular use"), false);
  assert.equal(monthlyPlan.dailyPodcastLimit, 12);
  assert.equal(monthlyPlan.weeklySummaryLimit, 5);
  assert.equal(annualPlan.dailyPodcastLimit, 15);
  assert.equal(annualPlan.weeklySummaryLimit, 10);
  assert.equal(annualAdvantage.extraDailyPodcasts, 3);
  assert.equal(annualAdvantage.extraWeeklySummaries, 5);
});

test("public marketing pages do not leak internal economics or vendor implementation details", () => {
  const publicPageSources = [
    `${marketingAppRoot}/page.tsx`,
    "../src/components/auth-landing-page.tsx",
    `${marketingAppRoot}/product/page.tsx`,
    "../src/lib/product-page-content.ts",
    `${marketingAppRoot}/pricing/page.tsx`,
    `${marketingAppRoot}/resources/page.tsx`,
    `${marketingAppRoot}/faq/page.tsx`,
    `${marketingAppRoot}/about/page.tsx`,
  ]
    .map((path) =>
      readFileSync(new URL(path, import.meta.url), "utf8").toLowerCase(),
    )
    .join("\n");

  for (const phrase of publicMarketingSensitivePhrases) {
    assert.equal(
      publicPageSources.includes(phrase),
      false,
      `public marketing pages leaked sensitive phrase: ${phrase}`,
    );
  }
});

test("resources page stays focused on Chrome capture and podcast app listening", () => {
  const source = readFileSync(
    new URL(`${marketingAppRoot}/resources/page.tsx`, import.meta.url),
    "utf8",
  ).toLowerCase();

  assert.equal(source.includes("add to chrome"), true);
  assert.equal(source.includes("/app/chrome-extension"), true);
  assert.equal(source.includes("/app/podcast-apps"), true);
  assert.equal(source.includes("apple podcasts"), true);
  assert.equal(source.includes("pocket casts"), true);
  assert.equal(
    source.includes("/resources/articlepod-extension-flow.gif"),
    true,
  );
  assert.equal(
    source.includes("the best version of articlepod feels almost invisible."),
    true,
  );
  assert.equal(source.includes("quick start"), false);
  assert.equal(source.includes("connect code"), false);
  assert.equal(source.includes("token"), false);
  assert.equal(source.includes("xml"), false);
});

test("public marketing copy focuses on instant episodes and weekly digest options", () => {
  const marketingSource = readFileSync(
    new URL("../src/lib/marketing-content.ts", import.meta.url),
    "utf8",
  );
  const loginSource = readFileSync(
    new URL("../src/components/auth-landing-page.tsx", import.meta.url),
    "utf8",
  );
  const faqSource = readFileSync(
    new URL(`${marketingAppRoot}/faq/page.tsx`, import.meta.url),
    "utf8",
  );
  const aboutSource = readFileSync(
    new URL(`${marketingAppRoot}/about/page.tsx`, import.meta.url),
    "utf8",
  );
  const productSource = readFileSync(
    new URL(`${marketingAppRoot}/product/page.tsx`, import.meta.url),
    "utf8",
  );
  const productContentSource = readFileSync(
    new URL("../src/lib/product-page-content.ts", import.meta.url),
    "utf8",
  );
  const normalizedProductSource = productSource.replace(/\s+/g, " ");
  const normalizedProductContentSource = productContentSource.replace(
    /\s+/g,
    " ",
  );
  const layoutSource = readFileSync(
    new URL("../src/app/layout.tsx", import.meta.url),
    "utf8",
  );
  const marketingLayoutSource = readFileSync(
    new URL(`${marketingAppRoot}/layout.tsx`, import.meta.url),
    "utf8",
  );

  assert.equal(
    marketingSource.includes("The intellectual sanctuary for busy readers."),
    true,
  );
  assert.equal(
    marketingSource.includes(
      "Archive favorite articles in a private feed and listen on the go with high-fidelity AI narration.",
    ),
    true,
  );
  assert.equal(
    marketingSource.includes(
      "Save URLs, PDFs, and Chrome captures, then catch up in your regular podcast app or with weekly digests.",
    ),
    true,
  );
  assert.equal(
    marketingSource.includes(
      "Catch up later with weekly recap options when you want the highlights together.",
    ),
    true,
  );
  assert.equal(
    marketingSource.includes("monthly and yearly trend recaps"),
    false,
  );
  assert.equal(marketingSource.includes("daily recap podcast"), false);
  assert.equal(marketingSource.includes("Curated archive"), true);
  assert.equal(marketingSource.includes("Listening now"), false);

  assert.equal(loginSource.includes("MarketingFooter"), false);
  assert.equal(loginSource.includes("Join Now"), false);
  assert.equal(loginSource.includes("Continue to your feed"), false);
  assert.equal(
    loginSource.includes(
      "First time? We&apos;ll create your account automatically.",
    ),
    true,
  );
  assert.equal(loginSource.includes("Private Knowledge Feed"), false);
  assert.equal(loginSource.includes("Listening now"), false);
  assert.equal(
    loginSource.includes("A private feed built for real catch-up time."),
    false,
  );
  assert.equal(
    loginSource.includes(
      "Built for people who save more than they can revisit.",
    ),
    false,
  );
  assert.equal(loginSource.includes("MarketingHeader"), false);
  assert.equal(loginSource.includes("MarketingCta"), false);

  assert.equal(
    faqSource.includes("What happens when I save an article?"),
    true,
  );
  assert.equal(faqSource.includes("Quick answers"), true);
  assert.equal(faqSource.includes("One save becomes one episode"), true);
  assert.equal(faqSource.includes("URLs, PDFs, and Chrome capture"), true);
  assert.equal(faqSource.includes("Private feed URL you control"), true);
  assert.equal(faqSource.includes("Works in standard podcast apps"), true);
  assert.equal(faqSource.includes("Getting started"), true);
  assert.equal(faqSource.includes("Inputs & capture"), true);
  assert.equal(faqSource.includes("Privacy & feed"), true);
  assert.equal(faqSource.includes("Podcast apps"), true);
  assert.equal(faqSource.includes("Account & access"), true);
  assert.equal(
    faqSource.includes(
      "const faqItems: ReadonlyArray<{ q: string; a: string }> = [",
    ),
    false,
  );
  assert.equal(faqSource.includes("const faqSections"), true);
  assert.equal(faqSource.includes("const quickAnswers"), true);
  assert.equal(faqSource.includes('href: "#getting-started"'), true);
  assert.equal(faqSource.includes("weekly podcast and email options"), true);
  assert.equal(
    faqSource.includes("What does the daily podcast include?"),
    false,
  );
  assert.equal(
    faqSource.includes("Can ArticlePod create long-term recaps?"),
    false,
  );
  assert.equal(faqSource.includes("Can I upload scanned PDFs?"), true);

  assert.equal(
    aboutSource.includes(
      "Built for people who save more than they can revisit",
    ),
    false,
  );
  assert.equal(
    aboutSource.includes(
      "Listen to your reading list and finally catch up on what matters",
    ),
    true,
  );
  assert.equal(
    aboutSource.includes("weekly digest podcast or email summaries"),
    true,
  );
  assert.equal(aboutSource.includes("Live today"), true);
  assert.equal(aboutSource.includes("What is live today"), false);
  assert.equal(aboutSource.includes("Why private RSS feed"), true);
  assert.equal(aboutSource.includes("Why private RSS"), true);
  assert.equal(aboutSource.includes("Per-article narrated episodes"), true);
  assert.equal(aboutSource.includes("Chrome extension capture"), true);
  assert.equal(aboutSource.includes("Private RSS feed delivery"), true);
  assert.equal(aboutSource.includes("Weekly digest podcast"), true);
  assert.equal(aboutSource.includes("Weekly Email Options"), true);
  assert.equal(
    aboutSource.includes("Integrates with your favorite podcast apps"),
    true,
  );
  assert.equal(
    aboutSource.includes("Listening queue Private by default"),
    true,
  );
  assert.equal(aboutSource.includes("Easy feed URL rotation"), true);
  assert.equal(
    aboutSource.includes(
      "ArticlePod turns article URLs and text-based PDFs into private podcast episodes you can hear in your favorite podcast apps,",
    ),
    true,
  );
  assert.equal(aboutSource.includes("even offline."), true);
  assert.equal(
    aboutSource.includes(
      "For easy recaps, add a weekly digest podcast or email summaries.",
    ),
    true,
  );
  assert.equal(
    aboutSource.includes(
      "Make your reading list effortless—listen anywhere, anytime, and retain more",
    ),
    true,
  );
  assert.equal(
    aboutSource.includes(
      "The product is designed for people who love to read and save thoughtful articles, but need a more practical way to keep",
    ),
    true,
  );
  assert.equal(
    aboutSource.includes(
      "track of them. It enhances reading and learning by making the most valuable pieces easier to organize, finish, retain, and",
    ),
    true,
  );
  assert.equal(
    aboutSource.includes("Chrome captures into private podcast episodes"),
    false,
  );
  assert.equal(
    aboutSource.includes(
      "Make saved reading easier to actually absorb instead of letting it pile up unread.",
    ),
    false,
  );
  assert.equal(
    aboutSource.includes(
      "The product is aimed at people who routinely save thoughtful reading but want a more practical way to revisit it.",
    ),
    false,
  );
  assert.equal(
    aboutSource.includes(
      "Your listening queue works in standard podcast apps, stays personal by default, and can be rotated if a feed URL ever",
    ),
    false,
  );
  assert.equal(aboutSource.includes("daily and weekly"), false);
  assert.equal(aboutSource.includes("Monthly and yearly recaps"), false);

  assert.equal(
    normalizedProductSource.includes(
      "Turn saved reading into a private podcast flow you actually finish.",
    ),
    true,
  );
  assert.equal(
    normalizedProductSource.includes(
      "Read-later piles do not become learning just because you saved them.",
    ),
    true,
  );
  assert.equal(productSource.includes("productRecommendationCards.map"), true);
  assert.equal(productSource.includes("productStoryBlocks.map"), true);
  assert.equal(productSource.includes("snap-x snap-mandatory"), true);
  assert.equal(productSource.includes("overflow-x-auto"), true);
  assert.equal(productSource.includes("See setup guides"), true);
  assert.equal(
    normalizedProductContentSource.includes(
      "/resources/articlepod-extension-flow.gif",
    ),
    true,
  );
  assert.equal(
    normalizedProductContentSource.includes("Workflow clip coming soon"),
    true,
  );
  assert.equal(normalizedProductContentSource.includes("Weekly digests"), true);
  assert.equal(productProofPills.length, 5);
  assert.equal(productRecommendationCards.length >= 4, true);
  assert.equal(productStoryBlocks.length, 3);
  assert.equal(productStoryBlocks[0]?.media.type, "gif");
  assert.equal(
    productStoryBlocks
      .slice(1)
      .every((block) => block.media.type === "placeholder"),
    true,
  );
  assert.equal(productSource.includes("Daily briefing"), false);
  assert.equal(productSource.includes("long-horizon summaries"), false);

  assert.equal(layoutSource.includes("weekly digest summary options"), true);
  assert.equal(layoutSource.includes("daily and weekly briefings"), false);
  assert.equal(marketingLayoutSource.includes("MarketingHeader"), true);
  assert.equal(marketingLayoutSource.includes("MarketingCta"), true);
});
