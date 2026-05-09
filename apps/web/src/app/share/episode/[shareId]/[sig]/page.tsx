import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import React from "react";
import Link from "next/link";
import type { AnalyticsSourceType } from "@articlepod/core";
import { BRAND_NAME } from "@articlepod/core/src/config/brand";
import { BRAND_PODCAST_COVER_PATH } from "@/lib/brand-assets";
import { recordAnalyticsEventBestEffort } from "@/lib/admin-analytics/events";
import {
  buildPublicEpisodeMediaUrl,
  buildPublicEpisodeShareUrl,
  getPublicEpisodeShareContextById,
  verifyPublicEpisodeShareSignature
} from "@/lib/share-links";

function normalizeSourceType(sourceType: string): AnalyticsSourceType | null {
  return sourceType === "URL" || sourceType === "PDF" || sourceType === "HTML_SNAPSHOT" ? sourceType : null;
}

async function getValidatedContext(shareId: string, sig: string) {
  const context = await getPublicEpisodeShareContextById(shareId);
  if (!context) {
    return null;
  }

  const valid = verifyPublicEpisodeShareSignature(
    {
      shareId: context.share.id,
      tokenHash: context.share.tokenHash,
      scope: context.share.scope
    },
    sig
  );

  return valid ? context : null;
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ shareId: string; sig: string }>;
}): Promise<Metadata> {
  const { shareId, sig } = await params;
  const context = await getValidatedContext(shareId, sig);
  if (!context) {
    return {
      title: "Shared episode unavailable",
      description: "This shared ArticlePod episode is unavailable.",
      robots: { index: false, follow: false }
    };
  }

  const shareUrl = buildPublicEpisodeShareUrl(context.share);
  const description =
    context.item.sourceUrl && (context.item.sourceType === "URL" || context.item.sourceType === "HTML_SNAPSHOT")
      ? "Listen to this shared ArticlePod episode, then jump back to the original source whenever you want the full context."
      : "Listen to this shared ArticlePod episode and preview how ArticlePod turns reading into a private podcast workflow.";

  return {
    title: `${context.episode.title} | Shared Episode`,
    description,
    alternates: {
      canonical: shareUrl
    },
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false }
    },
    openGraph: {
      title: context.episode.title,
      description,
      url: shareUrl,
      images: [{ url: BRAND_PODCAST_COVER_PATH, alt: "ArticlePod cover art" }]
    },
    twitter: {
      card: "summary",
      title: context.episode.title,
      description,
      images: [BRAND_PODCAST_COVER_PATH]
    }
  };
}

export default async function SharedEpisodePage({
  params
}: {
  params: Promise<{ shareId: string; sig: string }>;
}) {
  const { shareId, sig } = await params;
  const context = await getValidatedContext(shareId, sig);
  if (!context) {
    return (
      <main className="min-h-screen py-6 sm:py-10">
        <div className="container-shell">
          <header className="mb-8">
            <Link href="/product" className="text-xl font-semibold tracking-tight text-[var(--ink)]">
              {BRAND_NAME}
            </Link>
          </header>
          <section className="card p-5">
            <p className="text-sm text-[var(--muted)]">Shared episode</p>
            <h1 className="mt-2 text-2xl font-bold">This shared episode is unavailable.</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">The link may be invalid, expired, or revoked.</p>
          </section>
        </div>
      </main>
    );
  }

  await recordAnalyticsEventBestEffort({
    eventType: "SHARE_PAGE_VIEWED",
    userId: context.share.userId,
    itemId: context.item.id,
    sourceType: normalizeSourceType(context.item.sourceType),
    dedupeKey: `share_page_viewed:${context.share.id}:${randomUUID()}`,
    metadata: {
      share_id: context.share.id,
      page_url: buildPublicEpisodeShareUrl(context.share)
    }
  });

  const mediaUrl = buildPublicEpisodeMediaUrl(context.share, context.episode);
  const downloadUrl = buildPublicEpisodeMediaUrl(context.share, context.episode, { download: true });
  const loginCta = `/api/share/cta?sid=${encodeURIComponent(context.share.id)}&sig=${encodeURIComponent(sig)}&target=login`;
  const pricingCta = `/api/share/cta?sid=${encodeURIComponent(context.share.id)}&sig=${encodeURIComponent(sig)}&target=pricing`;
  const showSourceLink =
    Boolean(context.item.sourceUrl) && (context.item.sourceType === "URL" || context.item.sourceType === "HTML_SNAPSHOT");

  return (
    <main className="min-h-screen py-6 sm:py-10">
      <div className="container-shell">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link href="/product" className="text-xl font-semibold tracking-tight text-[var(--ink)]">
            {BRAND_NAME}
          </Link>
          <nav aria-label="Shared page navigation" className="flex flex-wrap items-center gap-3 text-sm">
            <Link className="text-[var(--muted)] hover:text-[var(--ink)]" href="/product">
              Product
            </Link>
            <Link className="text-[var(--muted)] hover:text-[var(--ink)]" href="/pricing">
              Pricing
            </Link>
          </nav>
        </header>

        <section className="card space-y-5 p-5 sm:p-6">
          <div className="space-y-2">
            <p className="inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5] px-4 py-1 text-xs font-semibold text-[#0f6a54] sm:text-sm">
              Shared episode
            </p>
            <h1 className="max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">{context.episode.title}</h1>
            <p className="max-w-2xl text-sm text-[var(--muted)] sm:text-base">
              Listen here, download the audio, and start your own private ArticlePod feed when you&apos;re ready.
            </p>
          </div>

          <div className="rounded-2xl border border-[rgba(31,42,31,0.12)] bg-[#f8fcfb] p-4">
            <audio controls className="w-full" preload="metadata" src={mediaUrl} />
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <a className="rounded-lg border border-[#bfded4] bg-white px-4 py-2 font-semibold text-[var(--ink)]" href={downloadUrl}>
                Download audio
              </a>
              {showSourceLink ? (
                <a
                  className="rounded-lg border border-[#bfded4] bg-white px-4 py-2 font-semibold text-[var(--ink)]"
                  href={context.item.sourceUrl || undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original source
                </a>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
            <article className="space-y-2">
              <h2 className="text-lg font-semibold">Why ArticlePod?</h2>
              <p className="text-sm text-[var(--muted)]">
                Turn articles, PDFs, and browser captures into podcast-ready episodes, then keep everything in one private feed you can
                open in your podcast app.
              </p>
              <p className="text-sm text-[var(--muted)]">
                This link only shares this episode. The owner&apos;s private feed stays private, and the share can be revoked at any time.
              </p>
            </article>

            <aside className="rounded-2xl border border-[#d7e8e3] bg-[#f8fcfb] p-4">
              <h2 className="text-lg font-semibold">Start your own feed</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Save a URL or PDF, generate an episode, and keep everything in one private feed that works with the podcast app you
                already use.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white" href={loginCta}>
                  Create account
                </a>
                <a className="rounded-lg border border-[#bfded4] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)]" href={pricingCta}>
                  See pricing
                </a>
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">You&apos;ll land on ArticlePod and can start with the free plan.</p>
            </aside>
          </div>

          <div className="border-t border-[rgba(31,42,31,0.08)] pt-4">
            <Link href="/product" className="text-sm underline">
              Learn how ArticlePod works
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
