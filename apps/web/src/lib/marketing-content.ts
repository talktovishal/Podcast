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
  heroHeadline: "Stay on top of what you want to learn.",
  heroSubheading: "Turn articles and PDFs into personalized podcast episodes and listen on your schedule.",
  heroChips: ["Capture URL/PDF/extension", "Private RSS feed", "Daily to monthly summaries"],
  heroSecondary: "One private feed. All your saved reading.",
  ctaPrimary: "Get started",
  ctaSecondary: "Open app"
} as const;

export function containsBannedMarketingPhrase(input: string): boolean {
  const normalized = input.toLowerCase();
  return marketingBannedPhrases.some((phrase) => normalized.includes(phrase));
}
