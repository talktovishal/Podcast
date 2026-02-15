export type MarketingNavItem = {
  label: string;
  href: "/product" | "/pricing" | "/resources" | "/faq" | "/about";
};

export const marketingNavItems: ReadonlyArray<MarketingNavItem> = [
  { label: "Product", href: "/product" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/resources" },
  { label: "FAQ", href: "/faq" },
  { label: "About", href: "/about" }
];

export const marketingBannedPhrases: ReadonlyArray<string> = [
  "read less. listen more.",
  "away from your screen",
  "async processing pipeline"
];

export const marketingCopy = {
  heroBadge: "Personalized Podcasts",
  heroHeadline: "Turn saved reading into daily and weekly intelligence.",
  heroSubheading:
    "ArticlePod converts what you discover into instant episodes, a daily recap podcast, and a weekly topic briefing.",
  heroChips: ["Instant article podcasts", "Daily + weekly digest episodes", "Companion reading email"],
  heroSecondary:
    "As your library grows, unlock monthly and yearly trend recaps grounded in your own source articles.",
  ctaPrimary: "Start your knowledge feed",
  ctaSecondary: "Open app"
} as const;

export function containsBannedMarketingPhrase(input: string): boolean {
  const normalized = input.toLowerCase();
  return marketingBannedPhrases.some((phrase) => normalized.includes(phrase));
}
