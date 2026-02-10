import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";

export default function AboutPage() {
  return (
    <main className="min-h-screen py-6 sm:py-10">
      <div className="container-shell">
        <MarketingHeader activeHref="/about" />
        <section className="space-y-4">
          <p className="inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5] px-4 py-1 text-xs font-semibold text-[#0f6a54] sm:text-sm">
            About
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">Built for people who want to keep learning</h1>
          <p className="max-w-2xl text-base text-[var(--muted)] sm:text-lg">
            ArticlePod exists to help busy learners keep up with high-quality reading by turning saved content into personalized podcasts.
          </p>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <article className="card p-5">
            <h2 className="text-lg font-semibold">Mission</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Reduce the gap between what you want to read and what you actually absorb each week.
            </p>
          </article>
          <article className="card p-5">
            <h2 className="text-lg font-semibold">Direction</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Full-article narration today, with optional daily/weekly/monthly summary workflows next.
            </p>
          </article>
        </section>

        <MarketingCta />
      </div>
    </main>
  );
}
