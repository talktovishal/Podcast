import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { WikiBrowserClient } from "@/components/wiki-browser-client";
import { getAuthUserFromCookies } from "@/lib/auth";
import { getBillingSettingsState } from "@/lib/billing";
import { hasAnnualPersonalWikiAccess } from "@/lib/billing-contract";
import {
  getUserWikiManifestForApp,
  getUserWikiPageForApp,
  getUserWikiSourceAvailabilityForApp,
} from "@/lib/wiki";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function WikiEmptyState({
  readyItemCount,
  readySourceCount,
  snippetCount,
  submittedItemCount,
  submittedSourceCount,
}: Awaited<ReturnType<typeof getUserWikiSourceAvailabilityForApp>>) {
  const detailCopy =
    submittedSourceCount === 0
      ? "There is nothing in your wiki corpus yet, so there is nothing to build from. Save a few articles, PDFs, or snippets this week and this page will turn into your wiki once enough source material has accumulated."
      : readySourceCount === 0
        ? `You already have ${formatCount(submittedItemCount, "saved article")} and ${formatCount(snippetCount, "saved snippet")} in motion, but the wiki is still waiting for processed source material before the first publish can go live.`
        : `You already have ${formatCount(readySourceCount, "ready source")} available for the wiki. Keep saving through the week and we will automatically replace this placeholder after the next wiki processing pass.`;

  return (
    <section className="card p-4 sm:p-5">
      <div className="max-w-3xl">
        <h2 className="text-lg font-semibold">No personal wiki has been published yet</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Pro Annual keeps the wiki surface visible even before the first build.
          Save articles, PDFs, and snippets throughout the week. Once enough
          source material has accumulated, we automatically process it and swap
          this placeholder for your personal wiki.
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">{detailCopy}</p>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[rgba(31,122,90,0.14)] bg-[rgba(247,251,250,0.72)] p-3">
          <dt className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Saved articles
          </dt>
          <dd className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
            {submittedItemCount}
          </dd>
        </div>
        <div className="rounded-2xl border border-[rgba(31,122,90,0.14)] bg-[rgba(247,251,250,0.72)] p-3">
          <dt className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Saved snippets
          </dt>
          <dd className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
            {snippetCount}
          </dd>
        </div>
        <div className="rounded-2xl border border-[rgba(31,122,90,0.14)] bg-[rgba(247,251,250,0.72)] p-3">
          <dt className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Ready sources
          </dt>
          <dd className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
            {readyItemCount + snippetCount}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          className="inline-flex rounded-lg border border-[rgba(31,122,90,0.18)] bg-white px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:border-[rgba(31,122,90,0.32)] hover:bg-[rgba(247,251,250,0.9)]"
          href="/app"
        >
          Add articles
        </Link>
        <span className="text-sm text-[var(--muted)]">
          We have {formatCount(submittedSourceCount, "saved source")} queued for
          the wiki so far.
        </span>
      </div>
    </section>
  );
}

export default async function WikiPage({
  params,
}: {
  params: { slug?: string[] };
}) {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/");
  }

  const [billingState, manifest] = await Promise.all([
    getBillingSettingsState(user.id),
    getUserWikiManifestForApp(user.id),
  ]);
  const showWikiPlaceholder = hasAnnualPersonalWikiAccess(
    billingState.selectedBilling,
  );

  if (!manifest) {
    if (!showWikiPlaceholder) {
      redirect("/app");
    }

    const sourceAvailability = await getUserWikiSourceAvailabilityForApp(user.id);

    return (
      <main className="py-5 sm:py-8">
        <div className="container-shell space-y-6">
          <section className="card p-4 sm:p-5">
            <div>
              <h1 className="font-bold text-2xl">Wiki</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Browse your personal reading wiki, starting with the main themes
                and pages instead of the raw source plumbing underneath.
              </p>
            </div>
          </section>

          <WikiEmptyState {...sourceAvailability} />
        </div>
      </main>
    );
  }

  const page = await getUserWikiPageForApp(user.id, { slug: params.slug });
  if (!page) {
    notFound();
  }

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <section className="card p-4 sm:p-5">
          <div>
            <h1 className="font-bold text-2xl">Wiki</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Browse your personal reading wiki, starting with the main themes and
              pages instead of the raw source plumbing underneath.
            </p>
          </div>
        </section>

        <WikiBrowserClient
          activePage={page.page}
          content={page.content}
          manifest={manifest}
        />
      </div>
    </main>
  );
}
