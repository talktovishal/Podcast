import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";

const faqItems: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "What content can I convert?",
    a: "You can submit article URLs, upload text-based PDFs, and capture open pages with the Chrome extension. ArticlePod focuses on clean, readable sources and keeps the original links attached for traceability. If content is too noisy or unsupported, you’ll see a clear error instead of silent failure."
  },
  {
    q: "What does the daily podcast include?",
    a: "The daily podcast is a recap of newly saved reading from the last 24 hours. It helps you catch up quickly while still keeping source context anchored to your saved articles. It is designed to be short, practical, and easy to consume during commutes or breaks."
  },
  {
    q: "How is the weekly podcast different?",
    a: "The weekly episode groups key developments by topic instead of listing articles one by one. This gives you a higher-level view of what changed and what matters most across the week. It is meant to surface themes and patterns, not just headlines."
  },
  {
    q: "Do I also get a reading version?",
    a: "Yes. Alongside podcast briefings, you receive a detailed email summary for reading-first workflows. The email format is useful when you want to scan points quickly, jump back to source material, or archive summaries for later reference. Audio and email are complementary outputs from the same knowledge stream."
  },
  {
    q: "Is my feed private?",
    a: "Yes. Each account has a private feed token, and your feed URL includes that token. You can rotate the token at any time, which immediately invalidates older feed links. This gives you direct control if a feed URL is ever shared accidentally."
  },
  {
    q: "Which podcast apps are supported?",
    a: "Any RSS-capable podcast app is supported, including Apple Podcasts and other standard clients. ArticlePod validates feed and media delivery against podcast compatibility requirements such as HEAD and byte-range support. That keeps playback, seeking, and resume behavior reliable across clients."
  },
  {
    q: "Can I use OAuth and email login together?",
    a: "Yes. Local email/password login works by default, and Google/Apple sign-in can be enabled when configured. This lets you start quickly in local mode and adopt OAuth when you’re ready for broader user access. Both paths are designed to coexist safely."
  },
  {
    q: "Why can processing take longer for large inputs?",
    a: "Long sources are synthesized in chunks to keep jobs resilient and recoverable. Chunking improves reliability for long-form content and reduces the chance of total job failure. It can take a bit longer, but it preserves stability and restart safety."
  },
  {
    q: "Can ArticlePod create long-term recaps?",
    a: "Yes. As your archive grows, monthly and yearly recap workflows can summarize how themes changed over time. These long-horizon views are designed to show progression across the exact sources you collected. That keeps recap outputs grounded and auditable."
  }
];

export default function FaqPage() {
  return (
    <main className="min-h-screen py-6 sm:py-10">
      <div className="container-shell">
        <MarketingHeader activeHref="/faq" />
        <section className="space-y-4">
          <p className="inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5] px-4 py-1 text-xs font-semibold text-[#0f6a54] sm:text-sm">
            FAQ
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">Answers to common questions</h1>
        </section>

        <section className="mt-8 space-y-3">
          {faqItems.map((item) => (
            <details key={item.q} className="card p-4">
              <summary className="cursor-pointer text-sm font-semibold sm:text-base">{item.q}</summary>
              <p className="mt-2 text-sm text-[var(--muted)]">{item.a}</p>
            </details>
          ))}
        </section>

        <MarketingCta />
      </div>
    </main>
  );
}
