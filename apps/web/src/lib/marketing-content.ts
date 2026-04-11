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

export const KARPATHY_LLM_WIKI_GIST_URL =
  "https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f";

export const marketingCopy = {
  heroHeadline: "A private podcast feed that compounds into a personal wiki.",
  heroSubheading:
    "Save URLs, PDFs, and Chrome captures, listen in your regular podcast app, and build a Karpathy-inspired wiki that keeps accumulating synthesis instead of starting from scratch.",
  heroHighlights: [
    {
      title: "Private RSS feed",
      description: "Keep listening in the podcast app you already trust, without exposing your saved reading."
    },
    {
      title: "Persistent wiki",
      description: "Turn saved reading into durable, interlinked pages that keep getting better as you add more."
    },
    {
      title: "Snippets + sources",
      description: "Fold Chrome captures, snippets, articles, and PDFs into one living knowledge base."
    }
  ] as const,
  securityIntro:
    "Podcast access stays private across sign-in, pairing, and playback.",
  securityBullets: [
    "Social sign-in stays in secure server-side sessions.",
    "Chrome pairing uses a one-time code to protect your feed URL.",
    "Feed access and episode audio stay token-protected."
  ] as const,
  ctaPrimary: "Start your knowledge feed",
  ctaSecondary: "See pricing"
} as const;

export function containsBannedMarketingPhrase(input: string): boolean {
  const normalized = input.toLowerCase();
  return marketingBannedPhrases.some((phrase) => normalized.includes(phrase));
}
