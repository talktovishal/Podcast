import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getTtsCatalog,
  normalizeTtsSelection,
  signStableMediaUrl,
} from "@articlepod/core";
import { DashboardClient } from "@/components/dashboard-client";
import { ensureUserFeedTokenAccess, getAuthUserFromCookies } from "@/lib/auth";
import {
  getDashboardItems,
  getDemoExtractionDiagnostics,
  getUserTtsSettings,
} from "@/lib/dashboard";
import { env } from "@/lib/env";
import { findPrimaryUserById } from "@/lib/metadata-primary-auth";
import { getSubmissionQuotaSnapshot } from "@/lib/submission-quota";
import { getTtsProviderAvailability } from "@/lib/tts";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppDashboardPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/");
  }

  const isDemoUser = user.email.toLowerCase() === env.demoEmail.toLowerCase();
  const [
    feedAccess,
    items,
    ttsSettings,
    ttsAvailability,
    demoDiagnostics,
    userRecord,
  ] = await Promise.all([
    ensureUserFeedTokenAccess(user.id),
    getDashboardItems(user.id),
    getUserTtsSettings(user.id),
    getTtsProviderAvailability(),
    isDemoUser ? getDemoExtractionDiagnostics(user.id) : Promise.resolve([]),
    findPrimaryUserById(user.id),
  ]);
  const submissionQuota = await getSubmissionQuotaSnapshot(user.id);
  const normalizedSelection = normalizeTtsSelection({
    providerId: ttsSettings.providerId,
    voice: ttsSettings.voice,
  });
  const ttsCatalog = getTtsCatalog();
  const feedUrl = feedAccess.tokenValue
    ? `${env.appUrl}/rss/${feedAccess.tokenValue}.xml`
    : null;
  const feedUrlMessage =
    "Your current private feed is still active, but this legacy URL can no longer be shown here. Keep using the URL already added in your podcast app. If you rotate the token, you will need to re-add the new URL there.";
  const feedTokenHash = feedAccess.tokenHash;

  return (
    <main className="py-5 sm:py-6">
      <div className="container-shell space-y-4 sm:space-y-5">
        <DashboardClient
          viewMode="workspace"
          workspaceHeading={user.name || user.email}
          workspaceSubheading="Create new episodes quickly, then keep an eye on processing and playback below."
          feedUrl={feedUrl}
          feedUrlMessage={feedUrl ? null : feedUrlMessage}
          isAdmin={user.role === "ADMIN"}
          isDemoAccount={isDemoUser}
          initialSubmissionQuota={submissionQuota}
          initialProcessingMode={userRecord?.defaultItemProcessingMode === "SUMMARY_ONLY" ? "SUMMARY_ONLY" : "FULL_EPISODE"}
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
            processingMode: item.processingMode === "SUMMARY_ONLY" ? "SUMMARY_ONLY" : "FULL_EPISODE",
            importance: item.importance,
            tags: item.tags,
            errorCode: item.errorCode,
            errorMessage: item.errorMessage,
            summaryStatus:
              item.summaryStatus === "PROCESSING" || item.summaryStatus === "SUCCEEDED" || item.summaryStatus === "FAILED"
                ? item.summaryStatus
                : "NOT_REQUESTED",
            summaryTitle: item.summaryTitle,
            summaryCompletedAt: item.summaryCompletedAt ? item.summaryCompletedAt.toISOString() : null,
            summaryErrorCode: item.summaryErrorCode,
            summaryErrorMessage: item.summaryErrorMessage,
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
                    feedTokenHash,
                    item.episode.id,
                  ),
                }
              : null,
          }))}
        />
      </div>
    </main>
  );
}
