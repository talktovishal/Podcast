import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { SeoJsonLd } from "@/components/seo-json-ld";
import { marketingCopy } from "@/lib/marketing-content";
import {
  productProofPills,
  productRecommendationCards,
  productStoryBlocks,
  productTrustHighlights,
  type ProductStoryBlock,
} from "@/lib/product-page-content";
import {
  buildBreadcrumbSchema,
  buildPublicMetadata,
  buildSoftwareApplicationSchema,
} from "@/lib/seo";

const productDescription =
  "Turn saved URLs, PDFs, and Chrome captures into a private podcast flow you can actually finish, then add weekly digests when you want the bigger picture.";

export const metadata: Metadata = buildPublicMetadata({
  title: "Turn saved reading into a private podcast workflow",
  description: productDescription,
  path: "/product",
  keywords: [
    "turn reading backlog into podcast",
    "private RSS podcast app",
    "listen to articles app",
    "article narration workflow",
    "article to podcast workflow",
  ],
});

function StoryMedia({ block }: { block: ProductStoryBlock }) {
  const media = block.media;

  if (media.type === "gif") {
    return (
      <div className="rounded-[28px] border border-[rgba(31,122,90,0.14)] bg-white/95 p-3 shadow-[0_24px_60px_rgba(24,38,32,0.08)] sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full border border-[rgba(31,122,90,0.16)] bg-[rgba(223,243,236,0.55)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#14503d]">
            {media.frameLabel}
          </span>
          <span className="text-xs font-medium text-[var(--muted)]">
            GIF workflow
          </span>
        </div>
        <div className="mt-3 overflow-hidden rounded-[22px] border border-slate-200 bg-slate-50">
          <Image
            alt={media.alt}
            className="h-auto w-full"
            height={media.height}
            priority={false}
            src={media.src}
            unoptimized
            width={media.width}
          />
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          {media.caption}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-[rgba(31,122,90,0.14)] bg-[linear-gradient(180deg,rgba(248,252,251,0.98),rgba(235,246,242,0.92))] p-4 shadow-[0_24px_60px_rgba(24,38,32,0.08)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-[rgba(31,122,90,0.16)] bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#14503d]">
          {media.frameLabel}
        </span>
        <span className="text-xs font-medium text-[var(--muted)]">
          Designed for future clips
        </span>
      </div>
      <div
        aria-label={media.alt}
        className="mt-4 rounded-[24px] border border-[rgba(31,42,31,0.1)] bg-white/92 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
          {media.kicker}
        </p>
        <h3 className="mt-2 text-xl font-semibold leading-tight text-[var(--ink)]">
          {media.headline}
        </h3>
        <div className="mt-4 space-y-2">
          {media.bullets.map((bullet) => (
            <div
              key={bullet}
              className="flex items-start gap-3 rounded-2xl border border-[rgba(31,122,90,0.08)] bg-[rgba(247,251,250,0.92)] px-3 py-3"
            >
              <span
                aria-hidden="true"
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
              />
              <span className="text-sm leading-6 text-[var(--muted)]">
                {bullet}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
        {media.caption}
      </p>
    </div>
  );
}

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

      <section className="relative overflow-hidden rounded-[32px] border border-[rgba(31,122,90,0.12)] bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(236,247,243,0.96))] p-6 shadow-[0_28px_70px_rgba(24,38,32,0.08)] sm:p-8 lg:p-10">
        <div
          aria-hidden="true"
          className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[rgba(31,122,90,0.1)] blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-[rgba(223,243,236,0.8)] blur-3xl"
        />
        <div className="relative grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4d7b72]">
              For people who save more than they can revisit
            </p>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-[3.2rem]">
                Turn saved reading into a private podcast flow you actually
                finish.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
                Save URLs, PDFs, and Chrome captures. ArticlePod turns them into
                private podcast episodes that land in the podcast app you
                already use, with weekly digests when you want the bigger
                picture.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className="rounded-xl bg-[var(--ink)] px-5 py-3 text-sm font-semibold text-white"
                href="/"
              >
                {marketingCopy.ctaPrimary}
              </Link>
              <Link
                className="rounded-xl border border-[rgba(31,122,90,0.16)] bg-white px-5 py-3 text-sm font-semibold text-[var(--ink)]"
                href="/resources"
              >
                See setup guides
              </Link>
            </div>
            <p className="max-w-xl text-sm leading-6 text-[var(--muted)]">
              Better than a read-later pile because the output is something you
              can actually press play on.
            </p>
          </div>

          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute inset-x-8 top-4 h-24 rounded-full bg-[rgba(31,122,90,0.12)] blur-3xl"
            />
            <div className="relative rounded-[28px] border border-[rgba(31,122,90,0.14)] bg-white/94 p-4 shadow-[0_28px_70px_rgba(24,38,32,0.1)] sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full border border-[rgba(31,122,90,0.16)] bg-[rgba(223,243,236,0.55)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#14503d]">
                  Private listening flow
                </span>
                <span className="text-xs font-medium text-[var(--muted)]">
                  One item - one episode
                </span>
              </div>
              <div className="mt-4 space-y-3">
                <div className="rounded-[24px] border border-[rgba(31,122,90,0.1)] bg-[rgba(247,251,250,0.88)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#4d7b72]">
                    Save
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[var(--ink)]">
                    Catch the article, PDF, or open tab while it still matters.
                  </p>
                </div>
                <div className="flex items-center gap-3 px-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
                  <span className="h-px flex-1 bg-[rgba(31,122,90,0.12)]" />
                  <span>Private processing</span>
                  <span className="h-px flex-1 bg-[rgba(31,122,90,0.12)]" />
                </div>
                <div className="rounded-[24px] border border-[rgba(24,38,32,0.08)] bg-[var(--ink)] p-4 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#bde2d5]">
                    Output
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    Get a private episode that fits the podcast app you already
                    trust.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[22px] border border-[rgba(31,122,90,0.1)] bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#4d7b72]">
                      Listen now
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      Let the saved piece become part of your regular queue
                      instead of another dashboard.
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-[rgba(31,122,90,0.1)] bg-[rgba(237,248,245,0.92)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#4d7b72]">
                      Recap later
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      Add weekly digests when you want highlights and synthesis
                      on top of item-by-item listening.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5">
        <div className="rounded-[24px] border border-[rgba(31,122,90,0.12)] bg-white/82 p-3 sm:p-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {productProofPills.map((pill) => (
              <div
                key={pill.detail}
                className="rounded-2xl border border-[rgba(31,122,90,0.08)] bg-[rgba(247,251,250,0.9)] px-3 py-3"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#4d7b72]">
                  {pill.label}
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                  {pill.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4d7b72]">
              Recommendation rail
            </p>
            <h2 className="max-w-3xl text-2xl font-semibold leading-tight sm:text-[2rem]">
              The outcomes this page should eventually prove with real reader
              recommendations.
            </h2>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Scroll sideways on desktop or swipe on mobile.
          </p>
        </div>
        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-10 bg-gradient-to-r from-[var(--bg)] via-[rgba(247,251,250,0.95)] to-transparent sm:block"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-10 bg-gradient-to-l from-[var(--bg)] via-[rgba(247,251,250,0.95)] to-transparent sm:block"
          />
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 pr-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {productRecommendationCards.map((card) => (
              <article
                key={card.title}
                className="w-[280px] shrink-0 snap-start rounded-[28px] border border-[rgba(31,122,90,0.12)] bg-white/94 p-5 shadow-[0_20px_50px_rgba(24,38,32,0.07)] sm:w-[320px]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
                  {card.title}
                </p>
                <p className="mt-3 text-base leading-7 text-[var(--ink)]">
                  {card.statement}
                </p>
                <p className="mt-4 text-sm font-medium text-[#14503d]">
                  {card.outcome}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-[30px] border border-[rgba(24,38,32,0.08)] bg-[var(--ink)] p-6 text-white shadow-[0_24px_60px_rgba(24,38,32,0.14)] sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#bde2d5]">
            Why this converts better than read later
          </p>
          <h2 className="mt-3 max-w-xl text-2xl font-semibold leading-tight sm:text-[2rem]">
            Read-later piles do not become learning just because you saved them.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-[#d7e7e1] sm:text-base">
            ArticlePod changes the finish line. Instead of asking you to reopen
            tabs at the perfect moment, it turns the saved reading you care
            about into something playable inside the listening routine you
            already have.
          </p>
        </article>

        <article className="card p-6 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4d7b72]">
            What makes the workflow useful
          </p>
          <h2 className="mt-3 max-w-2xl text-2xl font-semibold leading-tight sm:text-[2rem]">
            The finish line is a podcast queue, not another dashboard to
            babysit.
          </h2>
          <ul className="mt-5 space-y-3 text-sm leading-7 text-[var(--muted)] sm:text-base">
            <li>
              - Capture articles without copy-pasting text into a separate tool.
            </li>
            <li>
              - Keep text-based PDFs beside article episodes in one listening
              flow.
            </li>
            <li>
              - Let private RSS delivery fit the podcast app you already trust.
            </li>
            <li>
              - Add weekly digests only when you want a recap layer on top of
              item-by-item listening.
            </li>
          </ul>
        </article>
      </section>

      <section className="mt-10 space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4d7b72]">
            Workflow story
          </p>
          <h2 className="max-w-3xl text-2xl font-semibold leading-tight sm:text-[2rem]">
            A conversion page should show how the system fits real reading
            behavior, not just list features.
          </h2>
        </div>

        {productStoryBlocks.map((block, index) => {
          const copy = (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(31,122,90,0.14)] bg-[rgba(223,243,236,0.6)] text-sm font-semibold text-[#14503d]">
                  {block.step}
                </span>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4d7b72]">
                  {block.eyebrow}
                </p>
              </div>
              <h3 className="max-w-2xl text-2xl font-semibold leading-tight sm:text-[2rem]">
                {block.title}
              </h3>
              <p className="max-w-2xl text-sm leading-7 text-[var(--muted)] sm:text-base">
                {block.body}
              </p>
              <ul className="space-y-3 text-sm leading-7 text-[var(--muted)] sm:text-base">
                {block.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
                    />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
          const media = <StoryMedia block={block} />;

          return (
            <article
              key={block.step}
              className="rounded-[32px] border border-[rgba(31,122,90,0.12)] bg-[rgba(255,255,255,0.82)] p-5 shadow-[0_20px_50px_rgba(24,38,32,0.06)] sm:p-6"
            >
              <div className="grid gap-6 lg:grid-cols-2 lg:items-center lg:gap-8">
                {index % 2 === 0 ? (
                  <>
                    {copy}
                    {media}
                  </>
                ) : (
                  <>
                    {media}
                    {copy}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="card p-6 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4d7b72]">
            Trust and privacy
          </p>
          <h2 className="mt-3 max-w-2xl text-2xl font-semibold leading-tight sm:text-[2rem]">
            Private by default without making playback feel harder.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)] sm:text-base">
            The point is not only turning text into audio. It is doing that in a
            way that keeps the listening experience calm, standard, and
            personal.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {productTrustHighlights.map((highlight) => (
              <div
                key={highlight.title}
                className="rounded-[22px] border border-[rgba(31,122,90,0.08)] bg-[rgba(247,251,250,0.92)] p-4"
              >
                <h3 className="text-base font-semibold text-[var(--ink)]">
                  {highlight.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  {highlight.description}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[30px] border border-[rgba(31,122,90,0.14)] bg-[rgba(223,243,236,0.5)] p-6 shadow-[0_20px_50px_rgba(24,38,32,0.06)] sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4d7b72]">
            What you get over time
          </p>
          <h2 className="mt-3 text-2xl font-semibold leading-tight sm:text-[2rem]">
            A calmer reading system that turns into listening.
          </h2>
          <ul className="mt-5 space-y-3 text-sm leading-7 text-[var(--muted)] sm:text-base">
            <li>
              - Full podcast episodes for saved articles, PDFs, and Chrome
              captures.
            </li>
            <li>
              - Weekly digest podcast and email recap options when you want the
              highlights together.
            </li>
            <li>
              - Private RSS delivery that works with standard podcast app
              habits.
            </li>
            <li>
              - Source links that keep the original article close for later
              rereading.
            </li>
          </ul>
        </article>
      </section>

      <section className="mt-10 rounded-[32px] border border-[rgba(31,122,90,0.12)] bg-[linear-gradient(135deg,rgba(24,38,32,0.98),rgba(31,122,90,0.92))] p-6 text-white shadow-[0_28px_70px_rgba(24,38,32,0.14)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#bde2d5]">
              Final call to action
            </p>
            <h2 className="max-w-3xl text-3xl font-semibold leading-tight sm:text-[2.5rem]">
              If the best reading still deserves your attention later, it should
              be easy to press play on it.
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-[#d7e7e1] sm:text-base">
              Start with one saved source, hear one finished episode, and decide
              from there whether you want weekly digests to help you keep the
              bigger picture.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[var(--ink)]"
              href="/"
            >
              {marketingCopy.ctaPrimary}
            </Link>
            <Link
              className="rounded-xl border border-[rgba(255,255,255,0.22)] px-5 py-3 text-sm font-semibold text-white"
              href="/pricing"
            >
              {marketingCopy.ctaSecondary}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
