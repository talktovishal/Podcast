import Link from "next/link";
import { getTtsCatalog, normalizeTtsSelection } from "@listenlater/core";
import { DashboardClient } from "@/components/dashboard-client";
import { getUserByShareToken } from "@/lib/auth";
import { getActiveFeedTokenForUser, getDashboardItems, getUserTtsSettings } from "@/lib/dashboard";
import { env } from "@/lib/env";
import { getTtsProviderAvailability } from "@/lib/tts";

export default async function SharePage({ searchParams }: { searchParams: { token?: string } }) {
  const shareToken = searchParams.token;
  if (!shareToken) {
    return (
      <main className="container-shell py-8">
        <p>Missing share token.</p>
      </main>
    );
  }

  const user = await getUserByShareToken(shareToken);
  if (!user) {
    return (
      <main className="container-shell py-8">
        <p>Invalid or expired share token.</p>
      </main>
    );
  }

  const feedToken = await getActiveFeedTokenForUser(user.id);
  if (!feedToken) {
    return (
      <main className="container-shell py-8">
        <p>No active feed for this user.</p>
      </main>
    );
  }

  const [items, ttsSettings, ttsAvailability] = await Promise.all([
    getDashboardItems(user.id),
    getUserTtsSettings(user.id),
    getTtsProviderAvailability()
  ]);
  const ttsCatalog = getTtsCatalog();
  const normalizedSelection = normalizeTtsSelection({
    providerId: ttsSettings.providerId,
    voice: ttsSettings.voice
  });

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <header className="card p-4 sm:p-5">
          <p className="text-sm text-[var(--muted)]">Read-only demo</p>
          <h1 className="font-bold text-2xl">{user.name || user.email}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">This shared view is read-only. You can listen, browse status, and validate podcast playback behavior.</p>
          <Link href="/login" className="mt-3 inline-block text-sm underline">
            Sign in to your own workspace
          </Link>
        </header>

        <DashboardClient
          readOnly
          feedUrl={`${env.appUrl}/rss/${feedToken}.xml`}
          feedToken={feedToken}
          initialTtsSelection={normalizedSelection}
          ttsCatalog={ttsCatalog}
          ttsAvailability={ttsAvailability}
          initialItems={items.map((item) => ({
            id: item.id,
            title: item.title,
            sourceType: item.sourceType,
            sourceUrl: item.sourceUrl,
            status: item.status,
            errorCode: item.errorCode,
            errorMessage: item.errorMessage,
            createdAt: item.createdAt.toISOString(),
            episode: item.episode
              ? {
                  audioPath: item.episode.audioPath,
                  audioBytes: item.episode.audioBytes,
                  mimeType: item.episode.mimeType
                }
              : null
          }))}
        />
      </div>
    </main>
  );
}
