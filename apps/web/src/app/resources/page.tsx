import type { Metadata } from "next";
import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Set up the ArticlePod Chrome extension to capture articles in one click. Step-by-step connection guide and quick troubleshooting tips.",
  alternates: { canonical: "/resources" }
};

export default function ResourcesPage() {
  return (
    <main className="min-h-screen py-6 sm:py-10">
      <div className="container-shell">
        <MarketingHeader activeHref="/resources" />
        <section className="space-y-4">
          <p className="inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5] px-4 py-1 text-xs font-semibold text-[#0f6a54] sm:text-sm">
            Resources
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">Chrome extension setup</h1>
          <p className="max-w-2xl text-base text-[var(--muted)] sm:text-lg">
            This page is focused on one thing: getting the extension connected so you can capture pages in one click.
          </p>
        </section>

        <section className="mt-8 card p-5">
          <h2 className="text-lg font-semibold">Step 1: Install the extension</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Install from the Chrome Web Store when available for your account. For private beta usage, load the packaged extension
            shared by your team.
          </p>
        </section>

        <section className="mt-4 card p-5">
          <h2 className="text-lg font-semibold">Step 2: Connect your account</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
            <li>Open ArticlePod and log in.</li>
            <li>Generate an extension connect code from your dashboard.</li>
            <li>Open the extension popup, paste the code, and connect.</li>
          </ol>
        </section>

        <section className="mt-4 card p-5">
          <h2 className="text-lg font-semibold">Step 3: Capture any page</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            While viewing an article, click the extension and submit. The item shows up in your account feed, and once processed it
            appears as a playable episode.
          </p>
        </section>

        <section className="mt-4 card p-5">
          <h2 className="text-lg font-semibold">Quick fixes</h2>
          <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
            <li>- If capture fails, reconnect with a fresh code from the dashboard.</li>
            <li>- If the page is not standard HTTP/HTTPS, open a regular article page and retry.</li>
            <li>- If processing takes longer, refresh your dashboard to see updated item status.</li>
          </ul>
        </section>

        <MarketingCta />
      </div>
    </main>
  );
}
