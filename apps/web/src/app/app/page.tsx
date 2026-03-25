import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTtsCatalog, normalizeTtsSelection, signStableMediaUrl } from "@articlepod/core";
import { AppShellNav } from "@/components/app-shell-nav";
import { DashboardClient } from "@/components/dashboard-client";
import { ensureUserFeedTokenAccess, getAuthUserFromCookies } from "@/lib/auth";
import { getDashboardItems, getDemoExtractionDiagnostics, getUserTtsSettings } from "@/lib/dashboard";
import { env } from "@/lib/env";
import { getSubmissionQuotaSnapshot } from "@/lib/submission-quota";
import { getTtsProviderAvailability } from "@/lib/tts";

export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

export default async function AppDashboardPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const isDemoUser = user.email.toLowerCase() === env.demoEmail.toLowerCase();
  const [feedAccess, items, ttsSettings, ttsAvailability, demoDiagnostics, submissionQuota] = await Promise.all([
    ensureUserFeedTokenAccess(user.id),
    getDashboardItems(user.id),
    getUserTtsSettings(user.id),
    getTtsProviderAvailability(),
    isDemoUser ? getDemoExtractionDiagnostics(user.id) : Promise.resolve([]),
    getSubmissionQuotaSnapshot(user.id)
  ]);
  const normalizedSelection = normalizeTtsSelection({
    providerId: ttsSettings.providerId,
    voice: ttsSettings.voice
  });
  const ttsCatalog = getTtsCatalog();
  const feedUrl = feedAccess.tokenValue ? `${env.appUrl}/rss/${feedAccess.tokenValue}.xml` : null;
  const feedUrlMessage =
    "Your current private feed is still active, but this legacy URL can no longer be shown here. Keep using the URL already added in your podcast app. If you rotate the token, you will need to re-add the new URL there.";
  const feedTokenHash = feedAccess.tokenHash;

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <header className="card p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-sm text-[var(--muted)]">Your workspace</p>
              <AppShellNav current="workspace" />
            </div>
            <div className="space-y-1">
              <h1 className="font-bold text-2xl">{user.name || user.email}</h1>
              <p className="text-sm text-[var(--muted)]">Create new episodes quickly, then keep an eye on processing and playback below.</p>
            </div>
          </div>
        </header>

        <DashboardClient
          viewMode="workspace"
          feedUrl={feedUrl}
          feedUrlMessage={feedUrl ? null : feedUrlMessage}
          isAdmin={user.role === "ADMIN"}
          isDemoAccount={isDemoUser}
          initialSubmissionQuota={submissionQuota}
          initialTtsSelection={normalizedSelection}
          ttsCatalog={ttsCatalog}
          ttsAvailability={ttsAvailability}
          initialDemoDiagnostics={demoDiagnostics}
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
            episode: item.episode
              ? {
                  id: item.episode.id,
                  audioPath: item.episode.audioPath,
                  audioBytes: item.episode.audioBytes,
                  mimeType: item.episode.mimeType,
                  mediaToken: signStableMediaUrl(
                    item.episode.audioPath,
                    env.mediaSigningKey || item.episode.guid,
                    feedTokenHash,
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
