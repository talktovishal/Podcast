import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";
import { marketingCopy } from "@/lib/marketing-content";

export default function ProductPage() {
  return (
    <main className="min-h-screen py-6 sm:py-10">
      <div className="container-shell">
        <MarketingHeader activeHref="/product" />
        <section className="space-y-4">
          <p className="inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5] px-4 py-1 text-xs font-semibold text-[#0f6a54] sm:text-sm">
            {marketingCopy.heroBadge}
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">How ArticlePod works</h1>
          <p className="max-w-2xl text-base text-[var(--muted)] sm:text-lg">
            Save what you want to read, then listen to it in one private podcast feed.
          </p>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <article className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">1. Capture</p>
            <h2 className="mt-2 text-lg font-semibold">From anywhere</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Paste a URL, upload a PDF, or capture the open page via Chrome extension.</p>
          </article>
          <article className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">2. Convert</p>
            <h2 className="mt-2 text-lg font-semibold">Clean narration audio</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">ArticlePod extracts useful content and generates personalized podcast episodes.</p>
          </article>
          <article className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">3. Listen</p>
            <h2 className="mt-2 text-lg font-semibold">Your private feed</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Episodes are published to a private RSS feed that works with standard podcast players.</p>
          </article>
        </section>

        <section className="mt-8 card p-5">
          <h2 className="text-lg font-semibold">Core capabilities</h2>
          <ul className="mt-3 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
            <li>- URL, PDF, and authenticated page capture ingestion</li>
            <li>- Private feed tokens with rotation support</li>
            <li>- Browser playback and secure media delivery</li>
            <li>- End-to-end async processing with progress visibility</li>
          </ul>
        </section>

        <MarketingCta />
      </div>
    </main>
  );
}
