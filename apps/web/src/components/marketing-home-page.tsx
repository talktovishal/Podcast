import Link from "next/link";
import { MarketingCta } from "@/components/marketing-cta";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { SeoJsonLd } from "@/components/seo-json-ld";
import { marketingCopy } from "@/lib/marketing-content";
import {
  buildBreadcrumbSchema,
  buildOrganizationSchema,
  buildSoftwareApplicationSchema,
  buildWebsiteSchema
} from "@/lib/seo";

const homepageDescription =
  "Turn saved articles, PDFs, and Chrome captures into a private podcast feed. Listen in Apple Podcasts, YouTube Music, or any RSS-compatible app with weekly digest options when you want a recap.";

const workflowSteps = [
  {
    eyebrow: "1. Save",
    title: "Capture URLs, PDFs, and open browser tabs",
    description:
      "Paste an article URL, upload a text-based PDF, or use the Chrome extension when you already have the page open."
  },
  {
    eyebrow: "2. Generate",
    title: "Create a ready-to-play private podcast episode",
    description:
      "ArticlePod extracts the text, prepares the narration, and publishes an MP3 episode into your private podcast feed."
  },
  {
    eyebrow: "3. Listen",
    title: "Catch up in your normal podcast app",
    description:
      "Use your private RSS feed in Apple Podcasts, YouTube Music, and other podcast apps that support private feeds."
  }
] as const;

const useCases = [
  {
    title: "Listen to articles during commute time",
    description:
      "Turn long reads into a podcast queue so saved reading becomes something you can finish away from the browser tab."
  },
  {
    title: "Listen to PDFs without copying text around",
    description:
      "Upload text-based research papers, essays, and reports directly and keep them alongside article episodes in the same private feed."
  },
  {
    title: "Build a private article-to-audio archive",
    description:
      "Keep the reading worth revisiting in one calm place, then add weekly digest podcast or email summaries when you want the highlights together."
  }
] as const;

const exploreCards = [
  {
    href: "/product",
    title: "See how the product works",
    description: "Understand the capture, narration, delivery, and private RSS flow from start to finish."
  },
  {
    href: "/pricing",
    title: "Compare Starter and Pro",
    description: "Review the free plan, monthly upgrade, and annual option before you subscribe."
  },
  {
    href: "/resources",
    title: "Set up the Chrome extension",
    description: "Follow the guided extension flow for faster browser capture and one-tap saving."
  },
  {
    href: "/faq",
    title: "Read the frequently asked questions",
    description: "Get clear answers about privacy, podcast app support, PDFs, and weekly digest options."
  }
] as const;

export function MarketingHomePage() {
  return (
    <>
      <SeoJsonLd
        data={[
          buildOrganizationSchema(),
          buildWebsiteSchema(homepageDescription),
          buildSoftwareApplicationSchema(homepageDescription),
          buildBreadcrumbSchema([{ name: "Home", path: "/" }])
        ]}
      />

      <main className="min-h-screen py-6 sm:py-10">
        <div className="container-shell space-y-8">
          <MarketingHeader />

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-start">
            <div className="space-y-5">
              <p className="inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5] px-4 py-1 text-xs font-semibold text-[#0f6a54] sm:text-sm">
                {marketingCopy.heroBadge}
              </p>
              <div className="space-y-3">
                <h1 className="max-w-4xl text-4xl font-bold leading-[0.98] tracking-tight sm:text-5xl xl:text-[3.9rem]">
                  Turn articles and PDFs into a private podcast feed.
                </h1>
                <p className="max-w-3xl text-lg leading-8 text-[var(--muted)]">{homepageDescription}</p>
                <p className="max-w-3xl text-base leading-7 text-[var(--muted)]">
                  {marketingCopy.heroHeadline} {marketingCopy.heroSubheading}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95"
                >
                  Start your knowledge feed
                </Link>
                <Link
                  href="/product"
                  className="rounded-lg border border-[#bfded4] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:bg-[#f6fbf9]"
                >
                  See how it works
                </Link>
              </div>
            </div>

            <aside className="card space-y-4 p-5 sm:p-6">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Why it stands out</p>
                <h2 className="text-2xl font-semibold text-[var(--ink)]">Article listening built around private RSS</h2>
              </div>
              <div className="grid gap-3">
                {marketingCopy.heroHighlights.map((item) => (
                  <article
                    key={item.title}
                    className="rounded-2xl border border-[rgba(31,122,90,0.12)] bg-[rgba(247,251,250,0.92)] p-4"
                  >
                    <h3 className="text-sm font-semibold text-[var(--ink)]">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</p>
                  </article>
                ))}
              </div>
            </aside>
          </section>

          <section aria-labelledby="homepage-workflow" className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">How it works</p>
              <h2 id="homepage-workflow" className="text-2xl font-semibold text-[var(--ink)] sm:text-3xl">
                A simple article-to-podcast workflow
              </h2>
              <p className="max-w-3xl text-base leading-7 text-[var(--muted)]">
                The flow stays straightforward: save something worth revisiting, let ArticlePod generate the episode, then hear it in the
                podcast app you already use.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {workflowSteps.map((step) => (
                <article key={step.title} className="card p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#4d7b72]">{step.eyebrow}</p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{step.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="homepage-use-cases" className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="card p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Built for busy readers</p>
              <h2 id="homepage-use-cases" className="mt-2 text-2xl font-semibold text-[var(--ink)]">
                Save reading once, listen on your schedule
              </h2>
              <p className="mt-3 text-base leading-7 text-[var(--muted)]">
                ArticlePod is useful when you want a private article-to-audio workflow without changing podcast habits. It keeps the
                source archive organized, the playback familiar, and the listening queue personal by default.
              </p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted)]">
                {marketingCopy.securityBullets.map((bullet) => (
                  <li key={bullet} className="rounded-2xl border border-[rgba(31,122,90,0.12)] bg-[rgba(247,251,250,0.92)] px-4 py-3">
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid gap-4">
              {useCases.map((item) => (
                <article key={item.title} className="card p-5">
                  <h3 className="text-lg font-semibold text-[var(--ink)]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="homepage-explore" className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Explore more</p>
              <h2 id="homepage-explore" className="text-2xl font-semibold text-[var(--ink)] sm:text-3xl">
                Learn more about the product, pricing, and setup
              </h2>
              <p className="max-w-3xl text-base leading-7 text-[var(--muted)]">
                Each public page now answers a different question, so it is easier to understand how ArticlePod works, what it costs,
                and how to get the Chrome extension set up.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {exploreCards.map((card) => (
                <Link key={card.href} href={card.href} className="card block p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                  <h3 className="text-lg font-semibold text-[var(--ink)]">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{card.description}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="text-2xl font-semibold text-[var(--ink)]">Ready to turn saved reading into a private podcast feed?</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--muted)]">
              Start with the free plan, keep your listening queue private by default, and upgrade later if you want weekly digest
              workflows or higher usage limits.
            </p>
            <MarketingCta secondaryHref="/pricing" secondaryLabel="See pricing" />
          </section>

          <MarketingFooter />
        </div>
      </main>
    </>
  );
}
