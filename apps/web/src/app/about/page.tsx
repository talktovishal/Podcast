import type { Metadata } from "next";
import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";
import { SeoJsonLd } from "@/components/seo-json-ld";
import {
  buildBreadcrumbSchema,
  buildOrganizationSchema,
  buildPublicMetadata
} from "@/lib/seo";

const aboutDescription =
  "Learn how ArticlePod helps busy readers turn saved articles, PDFs, and Chrome captures into private podcast episodes they can hear in regular podcast apps.";

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
                Your listening queue works in standard podcast apps, stays personal by default, and can be rotated if a feed URL ever
                needs to be replaced.
              </p>
            </article>
          </section>

          <section className="mt-8 card p-5">
            <h2 className="text-lg font-semibold">Who ArticlePod is for</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              The product is aimed at people who routinely save thoughtful reading but want a more practical way to revisit it. The goal
              is not to replace reading. It is to make the best saved pieces easier to finish, remember, and return to.
            </p>
          </section>

          <MarketingCta secondaryHref="/product" secondaryLabel="See how it works" />
        </div>
      </main>
    </>
  );
}
