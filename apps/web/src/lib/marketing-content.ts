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
  heroHeadline: "The intellectual sanctuary for busy readers.",
  heroSubheading:
    "Archive favorite articles in a private feed and listen on the go with high-fidelity AI narration. Save URLs, PDFs, and Chrome captures, then catch up in your regular podcast app or with weekly digests. Pro Annual includes a personal wiki based on Andrej Karpathy's LLM Wiki idea, built from the links and snippets you curate and rebuilt weekly.",
  heroHighlights: [
    {
      title: "Curated archive",
      description: "Keep the reading worth saving in one calm, focused queue."
    },
    {
      title: "Private RSS feed",
      description: "Listen in the podcast app you already use without exposing saved sources."
    },
    {
      title: "Podcast + email digests",
      description: "Catch up later with weekly recap options when you want the highlights together."
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
