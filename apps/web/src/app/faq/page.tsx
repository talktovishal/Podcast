import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";

const faqItems: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "What content can I convert?",
    a: "You can submit article URLs, upload text-based PDFs, and capture open pages with the Chrome extension."
  },
  {
    q: "What does the daily podcast include?",
    a: "The daily podcast is a recap of newly saved reading, designed for quick catch-up without losing source context."
  },
  {
    q: "How is the weekly podcast different?",
    a: "The weekly episode groups important developments by topic so you can hear trends instead of isolated articles."
  },
  {
    q: "Do I also get a reading version?",
    a: "Yes. Alongside podcast briefings, you receive a detailed email summary for reading-first workflows."
  },
  {
    q: "Is my feed private?",
    a: "Yes. Each account has a private feed token. Rotating the token invalidates previous feed URLs."
  },
  {
    q: "Which podcast apps are supported?",
    a: "Any RSS-capable podcast app, including Apple Podcasts and other standard clients."
  },
  {
    q: "Can I use OAuth and email login together?",
    a: "Yes. Local email/password works by default, and Google/Apple become available when configured."
  },
  {
    q: "Why can processing take longer for large inputs?",
    a: "Long sources are synthesized in chunks to keep jobs resilient and recoverable."
  },
  {
    q: "Can ArticlePod create long-term recaps?",
    a: "Yes. As your archive grows, monthly and yearly recap workflows can summarize how themes changed over time."
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
