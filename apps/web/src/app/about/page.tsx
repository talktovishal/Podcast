import type { Metadata } from "next";
import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn how ArticlePod turns saved articles, PDFs, and browser captures into private podcast episodes, with weekly digest options when you want a recap.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About | ArticlePod",
    description:
      "ArticlePod helps people turn saved reading into private podcast episodes they can hear in regular podcast apps, with weekly digest options on top.",
    url: "/about"
  },
  twitter: {
    title: "About | ArticlePod",
    description:
      "ArticlePod helps people turn saved reading into private podcast episodes they can hear in regular podcast apps, with weekly digest options on top."
  }
};

export default function AboutPage() {
  return (
    <main className="min-h-screen py-6 sm:py-10">
      <div className="container-shell">
        <MarketingHeader activeHref="/about" />
        <section className="space-y-4">
          <p className="inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5] px-4 py-1 text-xs font-semibold text-[#0f6a54] sm:text-sm">
            About
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">Built for people who save more than they can revisit</h1>
          <p className="max-w-2xl text-base text-[var(--muted)] sm:text-lg">
            ArticlePod turns article URLs, text-based PDFs, and Chrome captures into private podcast episodes you can hear in regular
            podcast apps. The core flow is simple: save one thing, get one episode, then add weekly digest podcast or email summaries
            when you want a recap layer.
          </p>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <article className="card p-5">
            <h2 className="text-lg font-semibold">Mission</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Make saved reading easier to actually absorb instead of letting it pile up unread.
            </p>
          </article>
          <article className="card p-5">
            <h2 className="text-lg font-semibold">What is live today</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Per-article narration, Chrome extension capture, private RSS delivery, and weekly digest podcast/email options.
            </p>
          </article>
          <article className="card p-5">
            <h2 className="text-lg font-semibold">Why private RSS</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Your listening queue works in standard podcast apps, stays personal by default, and can be rotated if a feed URL ever needs
              to be replaced.
            </p>
          </article>
        </section>

        <MarketingCta />
      </div>
    </main>
  );
}
