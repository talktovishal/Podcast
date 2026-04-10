import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTtsCatalog, normalizeTtsSelection } from "@articlepod/core";
import { AppShellNav } from "@/components/app-shell-nav";
import { DashboardClient } from "@/components/dashboard-client";
import { PodcastAppWalkthroughs } from "@/components/podcast-app-walkthroughs";
import { WorkspaceBillingSummary } from "@/components/workspace-billing-summary";
import { ensureUserFeedTokenAccess, getAuthUserFromCookies } from "@/lib/auth";
import {
  getBillingSettingsState,
  isBillingPlanCheckoutConfigured,
} from "@/lib/billing";
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

  const [feedAccess, ttsSettings, ttsAvailability, billingState] =
    await Promise.all([
      ensureUserFeedTokenAccess(user.id),
      getUserTtsSettings(user.id),
      getTtsProviderAvailability(),
      getBillingSettingsState(user.id),
    ]);
  const billingConfigured =
    isBillingPlanCheckoutConfigured("PRO_MONTHLY") ||
    isBillingPlanCheckoutConfigured("PRO_ANNUAL");
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

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <header className="card p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <WorkspaceBillingSummary
                billingConfigured={billingConfigured}
                initialBilling={billingState.liveBilling}
                sandboxModeActive={
                  billingState.mode.effectiveLane === "SANDBOX"
                }
              />
              <AppShellNav current="podcast-apps" userId={user.id} />
            </div>
            <div className="space-y-1">
              <h1 className="font-bold text-2xl">Podcast Apps</h1>
              <p className="text-sm text-[var(--muted)]">
                Copy your private feed URL and add it to any RSS-capable podcast
                app — on iPhone, Android, or desktop.
              </p>
            </div>
          </div>
        </header>

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
              4. Only rotate the feed token when you are ready to re-add the new
              URL in every app where you subscribed — rotating invalidates the
              old URL immediately.
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
