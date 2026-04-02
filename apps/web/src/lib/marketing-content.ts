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
  heroHeadline: "Turn saved reading into private podcast episodes.",
  heroSubheading:
    "Save URLs, PDFs, and Chrome captures into an ad-free private feed, then listen in your regular podcast app or catch up with weekly podcast and email digests.",
  heroHighlights: [
    {
      title: "Curated archive",
      description: "Keep the reading worth saving in a calm, focused library built around your own queue."
    },
    {
      title: "Private RSS feed",
      description: "Listen in the standard podcast app you already use, without exposing your saved sources publicly."
    },
    {
      title: "Podcast + email digests",
      description: "Catch up later with weekly recap options when you want the highlights gathered back together."
    }
  ] as const,
  heroSecondary:
    "Built for people who save more than they can revisit.",
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
