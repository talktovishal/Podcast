import assert from "node:assert/strict";
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
