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
              Copy your private feed URL and choose the podcast app you want to
              use.
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

        <section className="scroll-mt-24 space-y-3" id="app-walkthroughs">
          <div>
            <h2 className="text-base font-semibold">App walkthroughs</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              If you tap an app button above first, your feed URL is already
              copied.
            </p>
          </div>
          <PodcastAppWalkthroughs />
        </section>
      </div>
    </main>
  );
}
