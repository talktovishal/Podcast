import type { Metadata } from "next";
import Link from "next/link";
import { getTtsCatalog, normalizeTtsSelection, signStableMediaUrl } from "@articlepod/core";
import { DashboardClient } from "@/components/dashboard-client";
import { getUserByShareToken } from "@/lib/auth";
import { getDashboardItems, getUserTtsSettings } from "@/lib/dashboard";
import { env } from "@/lib/env";
import { findPrimaryActiveFeedTokenByUserId } from "@/lib/metadata-primary-auth";
import { buildPublicMetadata } from "@/lib/seo";
import { getTtsProviderAvailability } from "@/lib/tts";

export const metadata: Metadata = buildPublicMetadata({
  title: "Shared workspace",
  description: "Read-only shared workspace view for ArticlePod.",
  path: "/share",
  noIndex: true
});

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

  const feedAccess = await findPrimaryActiveFeedTokenByUserId(user.id, "item");
  if (!feedAccess) {
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
  const feedUrl = feedAccess.tokenValue ? `${env.appUrl}/rss/${feedAccess.tokenValue}.xml` : null;

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <header className="card p-4 sm:p-5">
          <p className="text-sm text-[var(--muted)]">Read-only demo</p>
          <h1 className="font-bold text-2xl">{user.name || user.email}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">This shared view is read-only. You can listen, browse status, and validate podcast playback behavior.</p>
          <Link href="/" className="mt-3 inline-block text-sm underline">
            Sign in to your own workspace
          </Link>
        </header>

        <DashboardClient
          readOnly
          feedUrl={feedUrl}
          feedUrlMessage={
            feedUrl
              ? null
              : "This shared workspace can still play episodes, but the owner's current private feed URL is not available for display here."
          }
          isAdmin={false}
          initialTtsSelection={normalizedSelection}
          ttsCatalog={ttsCatalog}
          ttsAvailability={ttsAvailability}
          initialItems={items.map((item) => ({
            id: item.id,
            title: item.title,
            sourceType: item.sourceType,
            sourceUrl: item.sourceUrl,
            status: item.status,
            importance: item.importance,
            tags: item.tags,
            errorCode: item.errorCode,
            errorMessage: item.errorMessage,
            createdAt: item.createdAt.toISOString(),
            share: item.share,
            episode: item.episode
              ? {
                  id: item.episode.id,
                  audioPath: item.episode.audioPath,
                  audioBytes: item.episode.audioBytes,
                  mimeType: item.episode.mimeType,
                  mediaToken: signStableMediaUrl(
                    item.episode.audioPath,
                    env.mediaSigningKey || item.episode.guid,
                    feedAccess.tokenHash,
                    item.episode.id
                  )
                }
              : null
          }))}
        />
      </div>
    </main>
  );
}
