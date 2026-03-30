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

export const publicMarketingSensitivePhrases: ReadonlyArray<string> = [
  "capacity, cost, and margins",
  "better margin on regular use",
  "cost model",
  "azure baseline",
  "azure openai",
  "vm count",
  "egress",
  "reservations",
  "unit economics"
];

export const marketingCopy = {
  heroBadge: "Personalized Podcasts",
  heroHeadline: "Turn saved reading into private podcast episodes.",
  heroSubheading:
    "ArticlePod converts what you discover into instant episodes, with weekly digest podcast and email summaries when you want a recap layer.",
  heroChips: ["Instant article podcasts", "Weekly digest summaries", "Private RSS feed"],
  heroSecondary:
    "Save from URLs, PDFs, or Chrome, then listen in the podcast app you already use.",
  securityBullets: [
    "Sign-in via Google, Facebook, or Apple — sessions stay server-side in secure cookies.",
    "Chrome extension connects with a one-time code and a scoped token that never sees your feed URL.",
    "Your podcast feed uses a private token, and episode audio is authorized per episode."
  ] as const,
  ctaPrimary: "Start your knowledge feed",
  ctaSecondary: "Open app"
} as const;

export function containsBannedMarketingPhrase(input: string): boolean {
  const normalized = input.toLowerCase();
  return marketingBannedPhrases.some((phrase) => normalized.includes(phrase));
}
