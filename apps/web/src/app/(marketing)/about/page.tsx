import type { Metadata } from "next";
import { SeoJsonLd } from "@/components/seo-json-ld";
import {
  buildBreadcrumbSchema,
  buildOrganizationSchema,
  buildPublicMetadata
} from "@/lib/seo";

const aboutDescription =
  "Learn how ArticlePod turns article URLs and text-based PDFs into private podcast episodes you can hear in your favorite podcast apps, even offline.";

export const metadata: Metadata = buildPublicMetadata({
  title: "About ArticlePod",
  description: aboutDescription,
  path: "/about",
  keywords: [
    "about articlepod",
    "private podcast feed company",
    "article to audio mission"
  ]
});

export default function AboutPage() {
  return (
    <>
      <SeoJsonLd
        data={[
          buildOrganizationSchema(),
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "About", path: "/about" }
          ])
        ]}
      />

      <section className="space-y-4">
        <h1 className="max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">Listen to your reading list and finally catch up on what matters</h1>
        <p className="max-w-2xl text-base text-[var(--muted)] sm:text-lg">
          ArticlePod turns article URLs and text-based PDFs into private podcast episodes you can hear in your favorite podcast apps,
          even offline. Save one item, get one episode. For easy recaps, add a weekly digest podcast or email summaries.
        </p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <article className="card p-5">
          <h2 className="text-lg font-semibold">Mission</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Make your reading list effortless—listen anywhere, anytime, and retain more
          </p>
        </article>
        <article className="card p-5">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(31,122,90,0.12)] text-[var(--accent)]"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
                <path
                  d="M8 1.75l1.35 3.2 3.4 1.05-3.4 1.05L8 10.25l-1.35-3.2-3.4-1.05 3.4-1.05L8 1.75Zm4.25 7.5.75 1.8 1.75.55-1.75.55-.75 1.8-.75-1.8-1.75-.55 1.75-.55.75-1.8Z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <h2 className="text-lg font-semibold">Live today</h2>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
              <span>Per-article narrated episodes</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
              <span>Chrome extension capture</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
              <span>Private RSS feed delivery</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
              <span>Weekly digest podcast</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
              <span>Weekly Email Options</span>
            </li>
          </ul>
        </article>
        <article className="card p-5">
          <h2 className="text-lg font-semibold">Why private RSS feed</h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
              <span>Integrates with your favorite podcast apps</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
              <span>Listening queue Private by default</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
              <span>Easy feed URL rotation</span>
            </li>
          </ul>
        </article>
      </section>

      <section className="mt-8 card p-5">
        <h2 className="text-lg font-semibold">Who ArticlePod is for</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          The product is designed for people who love to read and save thoughtful articles, but need a more practical way to keep
          track of them. It enhances reading and learning by making the most valuable pieces easier to organize, finish, retain, and
          revisit.
        </p>
      </section>
    </>
  );
}
