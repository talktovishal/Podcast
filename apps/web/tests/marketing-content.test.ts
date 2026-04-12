import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  KARPATHY_LLM_WIKI_GIST_URL,
  containsBannedMarketingPhrase,
  marketingBannedPhrases,
  marketingCopy,
  marketingNavItems,
  publicMarketingSensitivePhrases,
} from "../src/lib/marketing-content";
import {
  paidPlanCapacityDelta,
  paidPlanConfig,
} from "../src/lib/paid-plan-config";
import { buildFaqPageContent } from "../src/lib/faq-page-content";

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
    "Archive favorite articles in a private feed and listen on the go with high-fidelity AI narration. Save URLs, PDFs, and Chrome captures, then catch up in your regular podcast app or with weekly digests. Pro Annual includes a personal wiki based on Andrej Karpathy's LLM Wiki idea, built from the links and snippets you curate and rebuilt weekly.",
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
      "Pro Annual is where the personal wiki becomes a real",
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
  assert.equal(source.includes("new podcast episodes per day"), true);
  assert.equal(
    source.includes("new private podcast episodes per 24 hours"),
    false,
  );
  assert.equal(source.includes("manual summaries per 7 days"), false);
  assert.equal(source.includes("Personal wiki access"), true);
  assert.equal(source.includes("Personal wiki automatically refreshes"), true);
  assert.equal(source.includes("Wiki plan"), true);
  assert.equal(
    source.includes("annual-only personal wiki that automatically refreshes"),
    true,
  );
  assert.equal(source.includes("Weekly digest podcast + email options"), true);
  assert.equal(
    source.indexOf('feature: "Personal wiki"') <
      source.indexOf('feature: "Weekly digest podcast + email"'),
    true,
  );
  assert.equal(
    source.includes('starter: { kind: "upgrade", value: "Upgrade to Pro Annual" }'),
    true,
  );
  assert.equal(
    source.includes('monthly: { kind: "upgrade", value: "Upgrade to Pro Annual" }'),
    true,
  );
  assert.equal(
    source.indexOf('feature: "Weekly digest podcast + email"') <
      source.indexOf('feature: "URL + PDF ingestion"'),
    true,
  );
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

test("public marketing copy focuses on the personal wiki and private feed flow", () => {
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
  const faqExplorerSource = readFileSync(
    new URL("../src/components/faq-explorer.tsx", import.meta.url),
    "utf8",
  );
  const aboutSource = readFileSync(
    new URL(`${marketingAppRoot}/about/page.tsx`, import.meta.url),
    "utf8",
  );
  const normalizedAboutSource = aboutSource.replace(/\s+/g, " ");
  const productSource = readFileSync(
    new URL(`${marketingAppRoot}/product/page.tsx`, import.meta.url),
    "utf8",
  );
  const normalizedProductSource = productSource.replace(/\s+/g, " ");
  const wikiSnapshotSource = readFileSync(
    new URL("../src/components/wiki-snapshot-preview.tsx", import.meta.url),
    "utf8",
  );
  const layoutSource = readFileSync(
    new URL("../src/app/layout.tsx", import.meta.url),
    "utf8",
  );
  const marketingLayoutSource = readFileSync(
    new URL(`${marketingAppRoot}/layout.tsx`, import.meta.url),
    "utf8",
  );
  const faqContent = buildFaqPageContent({
    freeTrialSubmissionLimit: 2,
    proMonthlyDailyPodcastLimit: 12,
    proMonthlyWeeklySummaryLimit: 5,
    proAnnualDailyPodcastLimit: 15,
    proAnnualWeeklySummaryLimit: 10,
  });

  assert.equal(
    marketingSource.includes(
      "The intellectual sanctuary for busy readers.",
    ),
    true,
  );
  assert.equal(
    marketingSource.includes(
      "Archive favorite articles in a private feed and listen on the go with high-fidelity AI narration. Save URLs, PDFs, and Chrome captures, then catch up in your regular podcast app or with weekly digests. Pro Annual includes a personal wiki based on Andrej Karpathy's LLM Wiki idea, built from the links and snippets you curate and rebuilt weekly.",
    ),
    true,
  );
  assert.equal(marketingSource.includes("Podcast + email digests"), true);
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
  assert.equal(loginSource.includes("WikiSnapshotPreview"), false);
  assert.equal(loginSource.includes("KARPATHY_LLM_WIKI_GIST_URL"), false);
  assert.equal(loginSource.includes("sm:grid-cols-3"), true);
  assert.equal(loginSource.includes("sm:grid-cols-2"), false);
  assert.equal(loginSource.includes("lg:grid-cols-1"), false);

  assert.equal(faqSource.includes("Quick answers"), true);
  assert.equal(faqSource.includes("FaqExplorer"), true);
  assert.equal(faqSource.includes("buildFaqPageContent"), true);
  assert.equal(
    faqContent.quickAnswers.some(
      (item) => item.label === "Integrates with standard podcast apps",
    ),
    true,
  );
  assert.equal(
    faqContent.sections.some((section) => section.title === "Getting started"),
    true,
  );
  assert.equal(
    faqContent.sections.some((section) => section.title === "Inputs & capture"),
    true,
  );
  assert.equal(
    faqContent.sections.some((section) => section.title === "Privacy & feed"),
    true,
  );
  assert.equal(
    faqContent.sections.some((section) => section.title === "Podcast apps"),
    true,
  );
  assert.equal(
    faqContent.sections.some((section) => section.title === "Account & access"),
    true,
  );
  assert.equal(
    faqSource.includes(
      "const faqItems: ReadonlyArray<{ q: string; a: string }> = [",
    ),
    false,
  );
  assert.equal(faqSource.includes("const faqSections"), false);
  assert.equal(faqSource.includes("const quickAnswers"), false);
  assert.equal(faqSource.includes("flattenFaqQuestionsForSchema"), true);
  assert.equal(faqExplorerSource.includes("Browse by topic"), false);
  assert.equal(faqExplorerSource.includes("Need something specific?"), false);
  assert.equal(
    faqExplorerSource.includes("Search privacy, pricing, PDFs, or digests"),
    false,
  );
  assert.equal(faqExplorerSource.includes("aria-pressed"), false);
  assert.equal(
    faqExplorerSource.includes("Link to ${question.question}"),
    false,
  );
  assert.equal(
    faqContent.sections
      .flatMap((section) => section.questions)
      .some(
        (question) =>
          question.question === "What's included in Starter vs Pro?",
      ),
    true,
  );
  assert.equal(
    faqContent.description.includes("annual-plan personal wiki access"),
    true,
  );
  assert.equal(
    faqContent.sections
      .flatMap((section) => section.questions)
      .some(
        (question) =>
          question.question === "Does ArticlePod build a personal wiki too?",
      ),
    true,
  );
  assert.equal(
    faqContent.sections
      .flatMap((section) => section.questions)
      .some(
        (question) =>
          question.question === "What does the daily podcast include?",
      ),
    false,
  );
  assert.equal(
    faqContent.sections
      .flatMap((section) => section.questions)
      .some(
        (question) =>
          question.question === "Can ArticlePod create long-term recaps?",
      ),
    false,
  );
  assert.equal(
    faqContent.sections
      .flatMap((section) => section.questions)
      .some(
        (question) =>
          question.question ===
          "What happens if a page is messy, blocked, or a scanned PDF?",
      ),
    true,
  );

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
  assert.equal(aboutSource.includes("From the co-founder"), false);
  assert.equal(aboutSource.includes("Section 1"), false);
  assert.equal(aboutSource.includes("Section 2"), false);
  assert.equal(aboutSource.includes("Section 3"), false);
  assert.equal(aboutSource.includes("Mission"), false);
  assert.equal(
    normalizedAboutSource.includes(
      "Andrej Karpathy described the LLM Wiki pattern",
    ),
    true,
  );
  assert.equal(aboutSource.includes("Live today"), true);
  assert.equal(aboutSource.includes("What is live today"), false);
  assert.equal(aboutSource.includes("Why private RSS feed"), true);
  assert.equal(aboutSource.includes("Why private RSS"), true);
  assert.equal(aboutSource.includes("Per-article narrated episodes"), true);
  assert.equal(aboutSource.includes("Chrome extension capture"), true);
  assert.equal(aboutSource.includes("Private RSS feed delivery"), true);
  assert.equal(aboutSource.includes("Karpathy-inspired personal wiki"), false);
  assert.equal(aboutSource.includes("Personal wiki"), true);
  assert.equal(aboutSource.includes("Snippet capture with reusable context"), false);
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
    normalizedAboutSource.includes(
      "Growing up in a family of doctors and professors, I developed an early respect for knowledge and lifelong learning.",
    ),
    true,
  );
  assert.equal(
    normalizedAboutSource.includes(
      "That curiosity shaped my path from full-stack engineer to AI product thinker.",
    ),
    true,
  );
  assert.equal(
    normalizedAboutSource.includes(
      "The product is designed for people who love to read and save thoughtful articles, but need a more practical way to keep",
    ),
    true,
  );
  assert.equal(
    normalizedAboutSource.includes(
      "track of them. It enhances reading and learning by making the most valuable pieces easier to organize, finish, retain, and",
    ),
    true,
  );
  assert.equal(
    aboutSource.includes("Smita Busar, Founder, engineer, and builder"),
    true,
  );
  assert.equal(
    aboutSource.includes("/brand/founder-portrait.jpg"),
    true,
  );
  assert.equal(aboutSource.includes("Why I build ArticlePod"), true);
  assert.equal(aboutSource.includes("How it has improved my life"), true);
  assert.equal(aboutSource.includes("Why I care?"), true);
  assert.equal(aboutSource.includes("1 - Why I build ArticlePod"), false);
  assert.equal(aboutSource.includes("2 - How it has improved my life"), false);
  assert.equal(aboutSource.includes("3 - Why I care?"), false);
  assert.equal(
    normalizedAboutSource.includes(
      "Like many people, I subscribed to newsletters, saved articles for later, and left too many tabs open across too many devices.",
    ),
    true,
  );
  assert.equal(
    normalizedAboutSource.includes(
      "As a mom juggling daily routines and a busy life, I often had to stop reading halfway through an article and rarely made it back.",
    ),
    true,
  );
  assert.equal(
    normalizedAboutSource.includes(
      "I built ArticlePod to solve a problem I knew well. It turns article URLs and text-based PDFs into private podcast episodes I can listen to in my favorite podcast apps, even offline.",
    ),
    true,
  );
  assert.equal(aboutSource.includes("KARPATHY_LLM_WIKI_GIST_URL"), true);
  assert.equal(
    normalizedAboutSource.includes(
      "Within a few weeks, I was finishing more of the articles and PDFs I actually cared about, and my open tabs dropped from more than 50 to fewer than 10 across all my devices.",
    ),
    true,
  );
  assert.equal(
    normalizedAboutSource.includes(
      "Most importantly, I felt more current, more informed, and happier.",
    ),
    true,
  );
  assert.equal(
    normalizedAboutSource.includes(
      "Honestly, I believe better technology leads to better habits. ArticlePod is a live example.",
    ),
    true,
  );
  assert.equal(
    normalizedAboutSource.includes(
      "Above all, I want ArticlePod to feel personal, calm, and genuinely useful long after the novelty fades.",
    ),
    true,
  );
  assert.equal(
    normalizedAboutSource.includes(
      "Make your reading list effortless—listen anywhere, anytime, and retain more",
    ),
    true,
  );
  assert.equal(
    normalizedAboutSource.includes(
      "We have now built that into ArticlePod as a personal wiki that keeps the links, snippets, and ideas worth retaining in one place.",
    ),
    true,
  );
  assert.equal(
    normalizedAboutSource.includes(
      "That matters because learning gets more useful when knowledge compounds instead of disappearing after a single listen.",
    ),
    true,
  );
  assert.equal(normalizedAboutSource.includes("Stay tuned."), false);
  assert.equal(
    normalizedAboutSource.includes(
      "Andrej Karpathy described the LLM Wiki pattern",
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
  assert.equal(aboutSource.includes("Who ArticlePod is for"), true);
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
      "ArticlePod turns saved reading into ongoing learning.",
    ),
    true,
  );
  assert.equal(
    normalizedProductSource.includes("Each article or PDF becomes a private podcast episode"),
    true,
  );
  assert.equal(productSource.includes("Save. Listen. Compile."), true);
  assert.equal(productSource.includes("Build the throughline"), true);
  assert.equal(productSource.includes("Pro Annual"), true);
  assert.equal(productSource.includes("rebuilt weekly"), true);
  assert.equal(productSource.includes("rebuilt daily"), false);
  assert.equal(
    productSource.includes("Persistent knowledge, not one-off answers."),
    true,
  );
  assert.equal(productSource.includes("WikiSnapshotPreview"), true);
  assert.equal(productSource.includes("KARPATHY_LLM_WIKI_GIST_URL"), true);
  assert.equal(wikiSnapshotSource.includes("782 linked pages"), true);
  assert.equal(wikiSnapshotSource.includes("Updated weekly"), true);
  assert.equal(productSource.includes("Daily briefing"), false);
  assert.equal(productSource.includes("long-horizon summaries"), false);

  assert.equal(layoutSource.includes("Karpathy-inspired personal wiki"), false);
  assert.equal(layoutSource.includes("weekly digest summary options"), true);
  assert.equal(layoutSource.includes("daily and weekly briefings"), false);
  assert.equal(marketingLayoutSource.includes("MarketingHeader"), true);
  assert.equal(marketingLayoutSource.includes("MarketingCta"), true);
});
