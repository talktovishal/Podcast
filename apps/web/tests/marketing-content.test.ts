import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  containsBannedMarketingPhrase,
  marketingBannedPhrases,
  marketingCopy,
  marketingNavItems
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

test("marketing copy uses personalized podcasts framing", () => {
  assert.equal(marketingCopy.heroBadge, "Personalized Podcasts");
});

test("hero copy does not include banned phrases", () => {
  const heroText = `${marketingCopy.heroHeadline} ${marketingCopy.heroSubheading} ${marketingCopy.heroSecondary}`;
  assert.equal(containsBannedMarketingPhrase(heroText), false);
  for (const phrase of marketingBannedPhrases) {
    assert.equal(heroText.toLowerCase().includes(phrase), false);
  }
});

test("security bullets has exactly three concise entries", () => {
  assert.equal(marketingCopy.securityBullets.length, 3);
  for (const bullet of marketingCopy.securityBullets) {
    assert.ok(bullet.length > 0, "bullet must not be empty");
    assert.ok(bullet.length <= 120, `bullet too long (${bullet.length} chars): ${bullet}`);
  }
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
  assert.equal(source.includes("scale into Pro or Team"), false);
  assert.equal(source.includes("<h2 className=\"text-lg font-semibold\">Team</h2>"), false);
  assert.equal(source.includes("$79/mo"), false);
  assert.equal(source.includes("$19/mo"), false);
});
