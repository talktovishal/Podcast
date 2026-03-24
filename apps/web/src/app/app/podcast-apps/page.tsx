import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTtsCatalog, normalizeTtsSelection } from "@articlepod/core";
import { AppShellNav } from "@/components/app-shell-nav";
import { DashboardClient } from "@/components/dashboard-client";
import { ensureUserDigestFeedTokenAccess, ensureUserFeedTokenAccess, getAuthUserFromCookies } from "@/lib/auth";
import { getUserTtsSettings } from "@/lib/dashboard";
import { env } from "@/lib/env";
import { getTtsProviderAvailability } from "@/lib/tts";

export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

export default async function PodcastAppsPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const [feedAccess, digestFeedAccess, ttsSettings, ttsAvailability] = await Promise.all([
    ensureUserFeedTokenAccess(user.id),
    ensureUserDigestFeedTokenAccess(user.id),
    getUserTtsSettings(user.id),
    getTtsProviderAvailability()
  ]);
  const normalizedSelection = normalizeTtsSelection({
    providerId: ttsSettings.providerId,
    voice: ttsSettings.voice
  });
  const ttsCatalog = getTtsCatalog();
  const feedUrl = feedAccess.tokenValue ? `${env.appUrl}/rss/${feedAccess.tokenValue}.xml` : null;
  const digestFeedUrl = digestFeedAccess.tokenValue ? `${env.appUrl}/rss/digest/${digestFeedAccess.tokenValue}.xml` : null;
  const feedUrlMessage =
    "Your current private feed is still active, but this legacy URL can no longer be shown here. Keep using the URL already added in your podcast app. If you rotate the token, you will need to re-add the new URL there.";
  const digestFeedUrlMessage =
    "Your current digest feed is still active, but this legacy URL can no longer be shown here. Rotate the digest token only when you are ready to replace the URL in your podcast app.";

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <header className="card p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-sm text-[var(--muted)]">Private feed setup</p>
              <AppShellNav current="podcast-apps" />
            </div>
            <div className="space-y-1">
              <h1 className="font-bold text-2xl">Podcast Apps</h1>
              <p className="text-sm text-[var(--muted)]">Copy your private feed, add it in Apple Podcasts or YouTube Music, and keep digest feed tools in one clean place.</p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
          <div className="card p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Quick start</h2>
            <ol className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li>1. Copy your private feed URL below.</li>
              <li>2. Open your podcast app and use its Add by URL flow.</li>
              <li>3. Only rotate the feed token when you are ready to replace the subscription inside the podcast app.</li>
            </ol>
          </div>
          <div className="card p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Walkthroughs</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This page is now dedicated to podcast app setup, so we can add Apple Podcasts and YouTube Music walkthrough videos here next without crowding the main workspace.
            </p>
          </div>
        </section>

        <DashboardClient
          viewMode="podcast-apps"
          feedUrl={feedUrl}
          feedUrlMessage={feedUrl ? null : feedUrlMessage}
          isAdmin={user.role === "ADMIN"}
          digestFeedUrl={digestFeedUrl}
          digestFeedUrlMessage={digestFeedUrl ? null : digestFeedUrlMessage}
          initialTtsSelection={normalizedSelection}
          ttsCatalog={ttsCatalog}
          ttsAvailability={ttsAvailability}
          initialItems={[]}
        />
      </div>
    </main>
  );
}
