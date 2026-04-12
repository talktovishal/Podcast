import Link from "next/link";
import type { Metadata } from "next";
import { WikiSnapshotPreview } from "@/components/wiki-snapshot-preview";
import { SeoJsonLd } from "@/components/seo-json-ld";
import { KARPATHY_LLM_WIKI_GIST_URL } from "@/lib/marketing-content";
import {
  buildBreadcrumbSchema,
  buildPublicMetadata,
  buildSoftwareApplicationSchema,
} from "@/lib/seo";

const productDescription =
  "See how ArticlePod turns articles, PDFs, and Chrome captures into private podcast episodes, with an annual-plan personal wiki that is rebuilt weekly.";

const productFlowSteps = [
  {
    step: "01",
    title: "Save what matters",
    body: "Paste a URL, upload a PDF, or use the Chrome extension when you are already reading. The capture step should stay light enough to use in the moment.",
  },
  {
    step: "02",
    title: "Listen in the app you already use",
    body: "Each saved article or PDF becomes a private podcast episode, so the finish line still feels like pressing play in your normal queue.",
  },
  {
    step: "03",
    title: "Build the throughline",
    body: "On Pro Annual, the personal wiki is rebuilt weekly so saved reading and snippets keep folding into durable, interlinked pages you can return to later.",
  },
] as const;

const productTrustPoints = [
  {
    title: "Private RSS feed",
    body: "Your episodes live in a private feed for personal listening, not public sharing.",
  },
  {
    title: "Standard podcast apps",
    body: "Keep using Apple Podcasts, Pocket Casts, Overcast, and other familiar players.",
  },
  {
    title: "Your feed, your control",
    body: "If access ever needs to change, you can rotate your feed without disrupting your routine.",
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

      <section className="space-y-3">
        <h1 className="max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">
          One system for continuous learning
        </h1>
        <p className="max-w-2xl text-base text-[var(--muted)] sm:text-lg">
          ArticlePod turns saved reading into ongoing learning. Each article or
          PDF becomes a private podcast episode. On Pro Annual, the personal
          wiki is rebuilt weekly so important ideas stay connected over time.
          It&apos;s a calmer, more practical way to stay current on the topics
          you care about.
        </p>
      </section>

      <section className="mt-6 rounded-[24px] border border-[rgba(31,122,90,0.12)] bg-[rgba(248,252,251,0.9)] p-4 sm:p-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
            Three-step flow
          </p>
          <h2 className="max-w-3xl text-2xl font-semibold leading-tight">
            Save. Listen. Compile.
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-[var(--muted)] sm:text-base">
            One calm rhythm for turning saved reading into something you
            actually finish.
          </p>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {productFlowSteps.map((step) => (
            <article
              key={step.step}
              className="rounded-2xl border border-[rgba(31,122,90,0.1)] bg-white/90 p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
                {step.step}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">
                {step.title}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">
                {step.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-[24px] border border-[rgba(31,122,90,0.12)] bg-white/92 p-4 sm:p-5">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
            Karpathy-inspired wiki
          </p>
          <h2 className="max-w-3xl text-2xl font-semibold leading-tight">
            Persistent knowledge, not one-off answers.
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-[var(--muted)] sm:text-base">
            Inspired by{" "}
            <a
              className="font-semibold text-[var(--ink)] underline decoration-[#8cb7ab] underline-offset-4 transition hover:decoration-[var(--ink)]"
              href={KARPATHY_LLM_WIKI_GIST_URL}
              rel="noreferrer"
              target="_blank"
            >
              Andrej Karpathy&apos;s LLM Wiki gist
            </a>
            , ArticlePod adds a durable, interlinked wiki layer on top of the
            private feed. It is available on Pro Annual and rebuilt weekly so
            the ideas you save are easier to revisit later.
          </p>
        </div>

        <WikiSnapshotPreview className="mt-4" />
      </section>

      <section className="mt-6 rounded-[24px] border border-[rgba(31,122,90,0.12)] bg-[linear-gradient(180deg,rgba(248,252,251,0.95),rgba(240,247,244,0.94))] p-4 sm:p-5">
        <div className="space-y-1.5">
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

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {productTrustPoints.map((point) => (
            <article
              key={point.title}
              className="rounded-2xl border border-[rgba(31,122,90,0.1)] bg-white/90 p-4"
            >
              <h3 className="text-base font-semibold text-[var(--ink)]">
                {point.title}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">
                {point.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-[24px] border border-[rgba(31,122,90,0.12)] bg-white/92 p-5 text-center shadow-[0_18px_40px_rgba(24,38,32,0.05)] sm:p-6">
        <div className="mx-auto max-w-2xl space-y-3">
          <h2 className="text-2xl font-semibold leading-tight text-[var(--ink)]">
            Start with one article and let the system grow from there.
          </h2>
          <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
            <Link
              className="font-semibold text-[var(--ink)] underline decoration-[#8cb7ab] underline-offset-4 transition hover:decoration-[var(--ink)]"
              href="/"
            >
              Start your knowledge feed
            </Link>{" "}
            with something worth keeping, and let ArticlePod turn it into a
            calmer listening flow.
          </p>
        </div>
      </section>
    </>
  );
}
