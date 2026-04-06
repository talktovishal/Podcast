import type { Metadata } from "next";
import { SeoJsonLd } from "@/components/seo-json-ld";
import {
  buildBreadcrumbSchema,
  buildPublicMetadata,
  buildSoftwareApplicationSchema,
} from "@/lib/seo";

const productDescription =
  "See how ArticlePod turns articles, PDFs, and Chrome captures into private podcast episodes, with weekly digest summaries when you want a recap layer.";

export const metadata: Metadata = buildPublicMetadata({
  title: "How ArticlePod works",
  description: productDescription,
  path: "/product",
  keywords: [
    "article to podcast workflow",
    "private RSS podcast app",
    "listen to articles app",
    "article narration workflow",
  ],
});

export default function ProductPage() {
  return (
    <>
      <SeoJsonLd
        data={[
          buildSoftwareApplicationSchema(productDescription),
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Product", path: "/product" },
          ]),
        ]}
      />

      <section className="space-y-4">
        <h1 className="max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">
          One system for continuous learning
        </h1>
        <p className="max-w-2xl text-base text-[var(--muted)] sm:text-lg">
          ArticlePod starts with one podcast episode per saved source, then adds
          weekly digest podcast and email summaries when you want a recap layer.
        </p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <article className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">
            1. Capture
          </p>
          <h2 className="mt-2 text-lg font-semibold">From anywhere</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Paste a URL, upload a PDF, or capture the open page via Chrome
            extension.
          </p>
        </article>
        <article className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">
            2. Listen now
          </p>
          <h2 className="mt-2 text-lg font-semibold">Instant episodes</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Every saved item can become a full podcast episode in your private
            feed.
          </p>
        </article>
        <article className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">
            3. Weekly digest
          </p>
          <h2 className="mt-2 text-lg font-semibold">Podcast + email</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Add a higher-level weekly recap with a digest podcast and
            reading-friendly email summary.
          </p>
        </article>
        <article className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">
            4. Private by default
          </p>
          <h2 className="mt-2 text-lg font-semibold">
            Standard podcast app workflow
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Listen in your regular podcast app with a private RSS feed you
            control.
          </p>
        </article>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <article className="card p-5">
          <h2 className="text-lg font-semibold">
            What makes the workflow useful
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            ArticlePod is designed for people who want to listen to saved
            reading without adopting a new playback habit. The output is a
            private RSS feed, so the end result feels like a regular podcast
            queue instead of another dashboard to check.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
            <li>
              - Save web articles without copy-pasting text into a separate
              tool.
            </li>
            <li>
              - Upload text-based PDFs and keep them beside article episodes.
            </li>
            <li>
              - Use the Chrome extension when capture from the open tab is the
              fastest path.
            </li>
          </ul>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-semibold">
            What happens after you save something
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Each submitted source is processed into its own private podcast
            episode. When it is ready, you can play it in browser, open it in a
            podcast app, or keep building toward a digest-style recap flow
            later.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
            <li>- Private RSS delivery for standard podcast apps.</li>
            <li>
              - Weekly digest podcast and email options when you want highlights
              together.
            </li>
            <li>
              - Clear source links so you can return to the original article
              whenever you want.
            </li>
          </ul>
        </article>
      </section>

      <section className="mt-8 card p-5">
        <h2 className="text-lg font-semibold">What you get over time</h2>
        <ul className="mt-3 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
          <li>
            - Full podcast episodes for saved articles, PDFs, and Chrome
            captures
          </li>
          <li>- Weekly digest podcast and email recap options</li>
          <li>- Private RSS feeds that work in standard podcast apps</li>
          <li>
            - Source-grounded listening with direct links back to original
            articles
          </li>
        </ul>
      </section>
    </>
  );
}
