import type { Metadata } from "next";
import { BillingActionButton } from "@/components/billing-action-button";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTtsCatalog, normalizeTtsSelection } from "@articlepod/core";
import { DashboardClient } from "@/components/dashboard-client";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { LogoutButton } from "@/components/logout-button";
import { ensureUserDigestFeedTokenAccess, ensureUserDigestSettings, ensureUserFeedTokenAccess, getAuthUserFromCookies } from "@/lib/auth";
import { billingPlanLabel, billingStatusLabel, getBillingAccountSnapshot, isBillingCheckoutConfigured } from "@/lib/billing";
import { getRecentDigestRuns, getUserDemographicSurvey, getUserTtsSettings } from "@/lib/dashboard";
import { env } from "@/lib/env";
import { getTtsProviderAvailability } from "@/lib/tts";

export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

export default async function AppSettingsPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const [feedAccess, digestFeedAccess, digestSettings, digestRuns, ttsSettings, ttsAvailability, demographicSurvey] = await Promise.all([
    ensureUserFeedTokenAccess(user.id),
    ensureUserDigestFeedTokenAccess(user.id),
    ensureUserDigestSettings(user.id),
    getRecentDigestRuns(user.id, 20),
    getUserTtsSettings(user.id),
    getTtsProviderAvailability(),
    getUserDemographicSurvey(user.id)
  ]);
  const billing = await getBillingAccountSnapshot(user.id);
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
        <header className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-sm text-[var(--muted)]">Account settings</p>
            <h1 className="font-bold text-2xl">{user.name || user.email}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Manage feed access, digest settings, extension auth, and default voice.</p>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Link className="rounded-lg bg-[var(--accent)] px-3 py-2 text-center text-sm font-semibold text-white" href="/app">
              Back to episodes
            </Link>
            <Link className="rounded-lg border px-3 py-2 text-center text-sm" href="/app/feedback">
              Feedback
            </Link>
            {user.role === "ADMIN" ? (
              <Link className="rounded-lg border px-3 py-2 text-center text-sm" href="/admin">
                Admin
              </Link>
            ) : null}
            {user.role !== "ADMIN" ? <DeleteAccountButton /> : null}
            <LogoutButton />
          </div>
        </header>

        <section className="card p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Billing</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Current access: {billing.accessReason === "complimentary" ? "Complimentary Pro" : billingPlanLabel(billing.planCode)} ·{" "}
                {billingStatusLabel(billing.status)}
              </p>
              {billing.currentPeriodEnd ? (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {billing.cancelAtPeriodEnd ? "Access ends on" : "Current billing period ends on"}{" "}
                  {new Date(billing.currentPeriodEnd).toLocaleDateString()}.
                </p>
              ) : null}
              {billing.accessReason === "complimentary" ? (
                <p className="mt-1 text-sm text-[var(--muted)]">This account currently has complimentary Pro access.</p>
              ) : null}
            </div>

            <div className="w-full sm:w-auto">
              {billing.accessReason === "billing" ? (
                <BillingActionButton
                  action="portal"
                  className="w-full rounded-lg border px-4 py-2 text-sm font-semibold sm:w-auto"
                  disabled={!billing.customerId}
                  label="Manage billing"
                />
              ) : billing.accessReason === "complimentary" ? (
                <p className="text-sm text-[var(--muted)]">Complimentary access is managed by an admin, not through Stripe.</p>
              ) : isBillingCheckoutConfigured() ? (
                <BillingActionButton
                  action="checkout"
                  className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
                  label="Upgrade to Pro"
                />
              ) : (
                <p className="text-sm text-[var(--muted)]">Billing setup is not configured in this environment yet.</p>
              )}
            </div>
          </div>
        </section>

        <DashboardClient
          viewMode="settings"
          feedUrl={feedUrl}
          feedUrlMessage={feedUrl ? null : feedUrlMessage}
          isAdmin={user.role === "ADMIN"}
          digestFeedUrl={digestFeedUrl}
          digestFeedUrlMessage={digestFeedUrl ? null : digestFeedUrlMessage}
          initialDigestSettings={{
            timezone: digestSettings.timezone,
            dailyEmailEnabled: digestSettings.dailyEmailEnabled,
            dailyPodcastEnabled: digestSettings.dailyPodcastEnabled,
            dailyHour: digestSettings.dailyHour,
            dailyMinute: digestSettings.dailyMinute,
            dailyLengthMinutes: digestSettings.dailyLengthMinutes as 5 | 15 | 30,
            weeklyEmailEnabled: digestSettings.weeklyEmailEnabled,
            weeklyPodcastEnabled: digestSettings.weeklyPodcastEnabled,
            weeklyDayOfWeek: digestSettings.weeklyDayOfWeek,
            weeklyHour: digestSettings.weeklyHour,
            weeklyMinute: digestSettings.weeklyMinute,
            weeklyLengthMinutes: digestSettings.weeklyLengthMinutes as 5 | 15 | 30
          }}
          initialDigestRuns={digestRuns.map((run) => ({
            id: run.id,
            cadence: run.cadence,
            periodKey: run.periodKey,
            status: run.status,
            sourceItemCount: run.sourceItemCount,
            scheduledFor: run.scheduledFor.toISOString(),
            windowStart: run.windowStart.toISOString(),
            windowEnd: run.windowEnd.toISOString(),
            emailEnabled: run.emailEnabled,
            emailStatus: run.emailStatus,
            podcastEnabled: run.podcastEnabled,
            podcastStatus: run.podcastStatus
          }))}
          initialDemographicSurvey={demographicSurvey}
          initialTtsSelection={normalizedSelection}
          ttsCatalog={ttsCatalog}
          ttsAvailability={ttsAvailability}
          initialItems={[]}
        />
      </div>
    </main>
  );
}
