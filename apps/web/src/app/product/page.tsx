import type { Metadata } from "next";
import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";
import { marketingCopy } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "Product",
  description:
    "ArticlePod converts articles and PDFs into instant episodes, daily recap podcasts, and weekly topic briefings — with companion email summaries.",
  alternates: { canonical: "/product" }
};

export default function ProductPage() {
  return (
    <main className="min-h-screen py-6 sm:py-10">
      <div className="container-shell">
        <MarketingHeader activeHref="/product" />
        <section className="space-y-4">
          <p className="inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5] px-4 py-1 text-xs font-semibold text-[#0f6a54] sm:text-sm">
            {marketingCopy.heroBadge}
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">One system for continuous learning</h1>
          <p className="max-w-2xl text-base text-[var(--muted)] sm:text-lg">
            ArticlePod starts with article-to-podcast conversion, then layers daily, weekly, and long-horizon summaries on top of
            your saved sources.
          </p>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <article className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">1. Capture</p>
            <h2 className="mt-2 text-lg font-semibold">From anywhere</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Paste a URL, upload a PDF, or capture the open page via Chrome extension.
            </p>
          </article>
          <article className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">2. Listen now</p>
            <h2 className="mt-2 text-lg font-semibold">Instant episodes</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Every saved item can become a full podcast episode in your private feed.
            </p>
          </article>
          <article className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">3. Daily briefing</p>
            <h2 className="mt-2 text-lg font-semibold">Podcast + email</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Get a daily recap episode plus a reading-friendly email summary of key takeaways.
            </p>
          </article>
          <article className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">4. Weekly intelligence</p>
            <h2 className="mt-2 text-lg font-semibold">Topic-structured insights</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Weekly digests group what changed by topic, with source-backed references.
            </p>
          </article>
        </section>

        <section className="mt-8 card p-5">
          <h2 className="text-lg font-semibold">What you get over time</h2>
          <ul className="mt-3 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
            <li>- Daily and weekly podcast briefings built from your saved reading stream</li>
            <li>- Companion email summaries for people who prefer reading</li>
            <li>- Monthly and yearly recap potential as your archive grows</li>
            <li>- Source-grounded summaries with direct links back to original articles</li>
          </ul>
        </section>

        <MarketingCta />
      </div>
    </main>
  );
}
