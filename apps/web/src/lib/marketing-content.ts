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
  heroBadge: "Private Knowledge Feed",
  heroHeadline: "The intellectual sanctuary for busy readers.",
  heroSubheading:
    "Archive favorite articles and listen on the go with high-fidelity AI narration.",
  heroHighlights: [
    {
      title: "Curated archive",
      description: "Keep the pieces worth revisiting in one calm queue."
    },
    {
      title: "Private RSS feed",
      description: "Use your regular podcast app without exposing saved sources."
    },
    {
      title: "Podcast + email digests",
      description: "Get a weekly recap when you want the highlights back together."
    }
  ] as const,
  securityIntro:
    "Podcast access stays private across sign-in, pairing, and playback.",
  securityBullets: [
    "Google, Facebook, or Apple sign-in stays in secure server-side sessions.",
    "Chrome pairing uses a one-time code so your feed URL stays private.",
    "Your feed and episode audio stay token-protected."
  ] as const,
  ctaPrimary: "Start your knowledge feed",
  ctaSecondary: "Open app"
} as const;

export function containsBannedMarketingPhrase(input: string): boolean {
  const normalized = input.toLowerCase();
  return marketingBannedPhrases.some((phrase) => normalized.includes(phrase));
}
