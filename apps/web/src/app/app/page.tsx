import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getTtsCatalog,
  normalizeTtsSelection,
  signStableMediaUrl,
} from "@articlepod/core";
import { AppShellNav } from "@/components/app-shell-nav";
import { DashboardClient } from "@/components/dashboard-client";
import { WorkspaceBillingSummary } from "@/components/workspace-billing-summary";
import { ensureUserFeedTokenAccess, getAuthUserFromCookies } from "@/lib/auth";
import {
  getBillingSettingsState,
  isBillingPlanCheckoutConfigured,
} from "@/lib/billing";
import {
  getDashboardItems,
  getDemoExtractionDiagnostics,
  getUserTtsSettings,
} from "@/lib/dashboard";
import { env } from "@/lib/env";
import { getSubmissionQuotaSnapshot } from "@/lib/submission-quota";
import { getTtsProviderAvailability } from "@/lib/tts";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppDashboardPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
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
    billingState,
  ] = await Promise.all([
    ensureUserFeedTokenAccess(user.id),
    getDashboardItems(user.id),
    getUserTtsSettings(user.id),
    getTtsProviderAvailability(),
    isDemoUser ? getDemoExtractionDiagnostics(user.id) : Promise.resolve([]),
    getBillingSettingsState(user.id),
  ]);
  const submissionQuota = await getSubmissionQuotaSnapshot(user.id);
  const monthlyCheckoutConfigured =
    isBillingPlanCheckoutConfigured("PRO_MONTHLY");
  const annualCheckoutConfigured =
    isBillingPlanCheckoutConfigured("PRO_ANNUAL");
  const billingConfigured =
    monthlyCheckoutConfigured || annualCheckoutConfigured;
  const billingSearchParam = Array.isArray(searchParams?.billing)
    ? searchParams?.billing[0]
    : searchParams?.billing;
  const billing = billingState.liveBilling;
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
    <main className="py-4 sm:py-6">
      <div className="container-shell space-y-4 sm:space-y-5">
        <header className="card p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
              <WorkspaceBillingSummary
                activationHint={billingSearchParam === "success"}
                billingConfigured={billingConfigured}
                initialBilling={billing}
                sandboxModeActive={
                  billingState.mode.effectiveLane === "SANDBOX"
                }
              />
              <AppShellNav current="workspace" userId={user.id} />
            </div>
            <div className="space-y-0.5">
              <h1 className="font-bold text-2xl">{user.name || user.email}</h1>
              <p className="text-sm text-[var(--muted)]">
                Create new episodes quickly, then keep an eye on processing and
                playback below.
              </p>
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
