import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";
import Link from "next/link";

export default function PricingPage() {
  return (
    <main className="min-h-screen py-6 sm:py-10">
      <div className="container-shell">
        <MarketingHeader activeHref="/pricing" />
        <section className="space-y-4">
          <p className="inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5] px-4 py-1 text-xs font-semibold text-[#0f6a54] sm:text-sm">
            Pricing
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">Plans for instant episodes and ongoing briefings</h1>
          <p className="max-w-2xl text-base text-[var(--muted)] sm:text-lg">
            Start with article podcasts today, then scale into daily and weekly intelligence digests with companion email reports.
          </p>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <article className="card p-5">
            <h2 className="text-lg font-semibold">Starter</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">For individual experimentation.</p>
            <p className="mt-3 text-2xl font-bold">$0</p>
            <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
              <li>- Limited monthly episodes</li>
              <li>- URL and PDF ingestion</li>
              <li>- Private RSS feed access</li>
            </ul>
          </article>

          <article className="card border-[#9ad0c0] p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1f7a5a]">Most practical</p>
            <h2 className="mt-1 text-lg font-semibold">Pro</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">For heavy personal learning workflows.</p>
            <p className="mt-3 text-2xl font-bold">$19/mo</p>
            <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
              <li>- Higher monthly ingest + episode limits</li>
              <li>- Chrome extension capture</li>
              <li>- Daily podcast + email briefing</li>
            </ul>
          </article>

          <article className="card p-5">
            <h2 className="text-lg font-semibold">Team</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">For groups and internal knowledge sharing.</p>
            <p className="mt-3 text-2xl font-bold">$79/mo</p>
            <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
              <li>- Shared administration</li>
              <li>- Weekly topic digest podcast</li>
              <li>- Team email summary reports</li>
            </ul>
          </article>
        </section>

        <section className="mt-8 card p-5">
          <h2 className="text-lg font-semibold">Capacity, cost, and margins</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Cost modeling uses your Azure baseline and configurable usage knobs (articles/day, average length, retries, VM count,
            egress, and reservations). See the{" "}
            <Link className="underline" href="/resources#cost-model">
              cost model details
            </Link>{" "}
            for the full assumption framework.
          </p>
        </section>

        <MarketingCta />
      </div>
    </main>
  );
}
