import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTtsCatalog, normalizeTtsSelection } from "@articlepod/core";
import { DashboardClient } from "@/components/dashboard-client";
import { PodcastAppWalkthroughs } from "@/components/podcast-app-walkthroughs";
import { ensureUserFeedTokenAccess, getAuthUserFromCookies } from "@/lib/auth";
import { getUserTtsSettings } from "@/lib/dashboard";
import { env } from "@/lib/env";
import { getTtsProviderAvailability } from "@/lib/tts";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PodcastAppsPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/");
  }

  const [feedAccess, ttsSettings, ttsAvailability] = await Promise.all([
    ensureUserFeedTokenAccess(user.id),
    getUserTtsSettings(user.id),
    getTtsProviderAvailability(),
  ]);
  const normalizedSelection = normalizeTtsSelection({
    providerId: ttsSettings.providerId,
    voice: ttsSettings.voice,
  });
  const ttsCatalog = getTtsCatalog();
  const feedUrl = feedAccess.tokenValue
    ? `${env.appUrl}/rss/${feedAccess.tokenValue}.xml`
    : null;
  const feedUrlMessage =
    "Your current private feed is still active, but this older URL can no longer be shown here. Keep using the URL already added in your podcast app unless you decide to replace it.";

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <section className="card p-4 sm:p-5">
          <div className="space-y-1">
            <h1 className="font-bold text-2xl">Podcast Apps</h1>
            <p className="text-sm text-[var(--muted)]">
              Copy your private feed URL, pick your podcast app, and keep
              private feed replacement tucked away unless you truly need it.
            </p>
          </div>
        </section>

        <DashboardClient
          viewMode="podcast-apps"
          feedUrl={feedUrl}
          feedUrlMessage={feedUrl ? null : feedUrlMessage}
          isAdmin={user.role === "ADMIN"}
          initialTtsSelection={normalizedSelection}
          ttsCatalog={ttsCatalog}
          ttsAvailability={ttsAvailability}
          initialItems={[]}
        />

        <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 sm:p-5">
          <h2 className="text-base font-semibold">Quick start</h2>
          <ol className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <li>1. Copy your private feed URL using the box above.</li>
            <li>
              2. Tap one of the app buttons to copy the URL and open the app at
              the same time.
            </li>
            <li>
              3. Paste the URL inside the app&apos;s &ldquo;Add by URL&rdquo; or
              &ldquo;Add a Show by URL&rdquo; flow.
            </li>
            <li>
              4. Only replace the private feed URL when you are ready to re-add
              the new one in every app where you subscribed. The old URL stops
              working immediately.
            </li>
          </ol>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">App walkthroughs</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Expand an app below for step-by-step instructions. Tap the app
              button first so your feed URL is already in your clipboard.
            </p>
          </div>
          <PodcastAppWalkthroughs />
        </section>
      </div>
    </main>
  );
}
