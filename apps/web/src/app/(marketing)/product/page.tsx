import Image from "next/image";
import type { Metadata } from "next";
import { SeoJsonLd } from "@/components/seo-json-ld";
import {
  buildBreadcrumbSchema,
  buildPublicMetadata,
  buildSoftwareApplicationSchema,
} from "@/lib/seo";

const productDescription =
  "See how ArticlePod turns articles, PDFs, and Chrome captures into private podcast episodes, with weekly digest summaries when you want a recap layer.";

const productFlowSteps = [
  {
    step: "01",
    title: "Save what matters",
    body: "Paste a URL, upload a PDF, or use the Chrome extension when you are already reading. The capture step should stay light enough to use in the moment.",
  },
  {
    step: "02",
    title: "Listen in the app you already use",
    body: "Each saved article or PDF becomes a private podcast episode, so the finish line feels like pressing play in your normal queue.",
  },
  {
    step: "03",
    title: "Recap when you want the throughline",
    body: "Weekly digest podcasts and email summaries can pull important ideas back together without replacing the original episodes.",
  },
] as const;

const productTrustPoints = [
  {
    title: "Private RSS feed",
    body: "Your episodes live in a private feed designed for personal listening, not a public stream.",
  },
  {
    title: "Standard podcast apps",
    body: "Apple Podcasts, Pocket Casts, Overcast, and other familiar players can stay part of the same routine.",
  },
  {
    title: "Your feed, your control",
    body: "If you ever need to change access, you can rotate the feed without changing the basic listening workflow.",
  },
] as const;

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
          ArticlePod turns saved reading into ongoing learning. Each article or
          PDF becomes a private podcast episode, with weekly digest podcasts and
          email summaries when you want an easy recap. It&apos;s a calmer, more
          practical way to stay current on the topics you care about.
        </p>
      </section>

      <section className="mt-10 rounded-[28px] border border-[rgba(31,122,90,0.12)] bg-[rgba(248,252,251,0.88)] p-5 sm:p-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
            Three-step flow
          </p>
          <h2 className="max-w-3xl text-2xl font-semibold leading-tight">
            Save. Listen. Recap.
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-[var(--muted)] sm:text-base">
            One calm rhythm for turning saved reading into something you
            actually finish.
          </p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {productFlowSteps.map((step) => (
            <article
              key={step.step}
              className="rounded-2xl border border-[rgba(31,122,90,0.1)] bg-white/88 p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
                {step.step}
              </p>
              <h3 className="mt-3 text-lg font-semibold text-[var(--ink)]">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                {step.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 card p-5 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
                Workflow demo
              </p>
              <h2 className="max-w-2xl text-2xl font-semibold leading-tight">
                See the capture flow once, then let it stay out of the way.
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                This is the lightest version of the workflow: connect the
                extension once, save the page you are already reading, and let
                ArticlePod turn it into a private episode later.
              </p>
            </div>

            <ul className="space-y-3 text-sm leading-6 text-[var(--muted)]">
              <li className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
                />
                <span>
                  Connect once and keep setup out of your daily routine.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
                />
                <span>
                  Save directly from the article you already have open.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
                />
                <span>
                  Let the finished episode show up in your private feed later.
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-[rgba(31,122,90,0.15)] bg-white p-3">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <Image
                alt="Animated walkthrough of the ArticlePod Chrome extension connect and capture flow."
                className="h-auto w-full"
                height={1027}
                priority={false}
                src="/resources/articlepod-extension-flow.gif"
                unoptimized
                width={800}
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              One quick connection, then saving from the page you are already
              reading feels almost invisible.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-10 rounded-[28px] border border-[rgba(31,122,90,0.12)] bg-[linear-gradient(180deg,rgba(248,252,251,0.95),rgba(240,247,244,0.92))] p-5 sm:p-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
            Trust and privacy
          </p>
          <h2 className="max-w-3xl text-2xl font-semibold leading-tight">
            Private by default, familiar in practice.
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-[var(--muted)] sm:text-base">
            The listening flow stays personal without asking you to learn a new
            playback habit.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {productTrustPoints.map((point) => (
            <article
              key={point.title}
              className="rounded-2xl border border-[rgba(31,122,90,0.1)] bg-white/88 p-5"
            >
              <h3 className="text-base font-semibold text-[var(--ink)]">
                {point.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                {point.body}
              </p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
