import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  containsBannedMarketingPhrase,
  marketingBannedPhrases,
  marketingCopy,
  marketingNavItems,
  publicMarketingSensitivePhrases
} from "../src/lib/marketing-content";

test("marketing nav items follow canonical order and routes", () => {
  assert.deepEqual(
    marketingNavItems.map((item) => item.label),
    ["Product", "Pricing", "Resources", "FAQ", "About"]
  );

  for (const item of marketingNavItems) {
    assert.ok(item.href.startsWith("/"));
    assert.notEqual(item.href, "#");
  }
});

test("marketing copy keeps concise busy-reader framing", () => {
  assert.equal(marketingCopy.heroHeadline, "The intellectual sanctuary for busy readers.");
  assert.equal(
    marketingCopy.heroSubheading,
    "Archive favorite articles in a private feed and listen on the go with high-fidelity AI narration. Save URLs, PDFs, and Chrome captures, then catch up in your regular podcast app or with weekly digests."
  );
  assert.deepEqual(
    marketingCopy.heroHighlights.map((item) => item.title),
    ["Curated archive", "Private RSS feed", "Podcast + email digests"]
  );
  assert.equal(
    marketingCopy.securityIntro,
    "Podcast access stays private across sign-in, pairing, and playback."
  );
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
    "Server-side social sign-in keeps identity flows secure.",
    "One-time Chrome pairing protects your feed URL.",
    "Feed and episode audio stay token-protected."
  ]);
  for (const bullet of marketingCopy.securityBullets) {
    assert.ok(bullet.length > 0, "bullet must not be empty");
    assert.ok(bullet.length <= 120, `bullet too long (${bullet.length} chars): ${bullet}`);
  }
});

test("auth landing page places the security trust band before the feature highlight cards", () => {
  const source = readFileSync(new URL("../src/components/auth-landing-page.tsx", import.meta.url), "utf8");
  assert.ok(source.indexOf("Private by design") < source.indexOf("marketingCopy.heroHighlights.map"));
});

test("pricing page exposes Starter plus monthly and annual Pro choices with clear billing policy", () => {
  const source = readFileSync(new URL("../src/app/pricing/page.tsx", import.meta.url), "utf8");

  assert.equal(source.includes("Simple pricing for personal listening"), true);
  assert.equal(source.includes("$15/mo"), true);
  assert.equal(source.includes("$130/yr"), true);
  assert.equal(source.includes("Save nearly 30%"), true);
  assert.equal(source.includes("Billed upfront monthly or yearly."), true);
  assert.equal(source.includes("Renews automatically until canceled."), true);
  assert.equal(source.includes("Cancel anytime. Access stays on through the current paid period."), true);
  assert.equal(source.includes("Annual plans stay active through the paid term, then stop renewing."), true);
  assert.equal(source.includes("15 new private podcast episodes per 24 hours"), true);
  assert.equal(source.includes("5 manual summaries per 7 days"), true);
  assert.equal(source.includes("higher limits, manual summaries, and weekly digest workflows"), true);
  assert.equal(source.includes("Weekly digest podcast + email options"), true);
  assert.equal(source.includes("Daily podcast + email briefing"), false);
  assert.equal(source.includes("scale into Pro or Team"), false);
  assert.equal(source.includes("<h2 className=\"text-lg font-semibold\">Team</h2>"), false);
  assert.equal(source.includes("$79/mo"), false);
  assert.equal(source.includes("$19/mo"), false);
  assert.equal(source.includes("Capacity, cost, and margins"), false);
  assert.equal(source.includes("cost model details"), false);
  assert.equal(source.includes("better margin on regular use"), false);
});

test("public marketing pages do not leak internal economics or vendor implementation details", () => {
  const publicPageSources = [
    "../src/app/page.tsx",
    "../src/components/auth-landing-page.tsx",
    "../src/app/product/page.tsx",
    "../src/app/pricing/page.tsx",
    "../src/app/resources/page.tsx",
    "../src/app/faq/page.tsx",
    "../src/app/about/page.tsx"
  ]
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf8").toLowerCase())
    .join("\n");

  for (const phrase of publicMarketingSensitivePhrases) {
    assert.equal(publicPageSources.includes(phrase), false, `public marketing pages leaked sensitive phrase: ${phrase}`);
  }
});

test("public marketing copy focuses on instant episodes and weekly digest options", () => {
  const marketingSource = readFileSync(new URL("../src/lib/marketing-content.ts", import.meta.url), "utf8");
  const loginSource = readFileSync(new URL("../src/components/auth-landing-page.tsx", import.meta.url), "utf8");
  const faqSource = readFileSync(new URL("../src/app/faq/page.tsx", import.meta.url), "utf8");
  const aboutSource = readFileSync(new URL("../src/app/about/page.tsx", import.meta.url), "utf8");
  const productSource = readFileSync(new URL("../src/app/product/page.tsx", import.meta.url), "utf8");
  const layoutSource = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");

  assert.equal(marketingSource.includes("The intellectual sanctuary for busy readers."), true);
  assert.equal(marketingSource.includes("Archive favorite articles in a private feed and listen on the go with high-fidelity AI narration."), true);
  assert.equal(marketingSource.includes("Save URLs, PDFs, and Chrome captures, then catch up in your regular podcast app or with weekly digests."), true);
  assert.equal(marketingSource.includes("Catch up later with weekly recap options when you want the highlights together."), true);
  assert.equal(marketingSource.includes("monthly and yearly trend recaps"), false);
  assert.equal(marketingSource.includes("daily recap podcast"), false);
  assert.equal(marketingSource.includes("Curated archive"), true);
  assert.equal(marketingSource.includes("Listening now"), false);

  assert.equal(loginSource.includes("MarketingFooter"), false);
  assert.equal(loginSource.includes("Join Now"), false);
  assert.equal(loginSource.includes("Continue to your feed"), false);
  assert.equal(loginSource.includes("First time? We&apos;ll create your account automatically."), true);
  assert.equal(loginSource.includes("Private Knowledge Feed"), false);
  assert.equal(loginSource.includes("Listening now"), false);
  assert.equal(loginSource.includes("A private feed built for real catch-up time."), false);
  assert.equal(loginSource.includes("Built for people who save more than they can revisit."), false);

  assert.equal(faqSource.includes("What happens when I save an article?"), true);
  assert.equal(faqSource.includes("weekly podcast and email options"), true);
  assert.equal(faqSource.includes("What does the daily podcast include?"), false);
  assert.equal(faqSource.includes("Can ArticlePod create long-term recaps?"), false);
  assert.equal(faqSource.includes("Can I upload scanned PDFs?"), true);

  assert.equal(aboutSource.includes("Built for people who save more than they can revisit"), true);
  assert.equal(aboutSource.includes("weekly digest podcast or email summaries"), true);
  assert.equal(aboutSource.includes("daily and weekly"), false);
  assert.equal(aboutSource.includes("Monthly and yearly recaps"), false);

  assert.equal(productSource.includes("one podcast episode per saved source"), true);
  assert.equal(productSource.includes("Weekly digest"), true);
  assert.equal(productSource.includes("Daily briefing"), false);
  assert.equal(productSource.includes("long-horizon summaries"), false);

  assert.equal(layoutSource.includes("weekly digest summary options"), true);
  assert.equal(layoutSource.includes("daily and weekly briefings"), false);
});
