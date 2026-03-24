import type { Metadata } from "next";
import { BillingActionButton } from "@/components/billing-action-button";
import { redirect } from "next/navigation";
import { getTtsCatalog, normalizeTtsSelection } from "@articlepod/core";
import { AppShellNav } from "@/components/app-shell-nav";
import { DashboardClient } from "@/components/dashboard-client";
import Link from "next/link";
import { ensureUserDigestSettings, getAuthUserFromCookies } from "@/lib/auth";
import { billingPlanLabel, billingStatusLabel, getBillingAccountSnapshot, isBillingCheckoutConfigured } from "@/lib/billing";
import { getRecentDigestRuns, getUserDemographicSurvey, getUserTtsSettings } from "@/lib/dashboard";
import { getTtsProviderAvailability } from "@/lib/tts";

export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

export default async function AppSettingsPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const [digestSettings, digestRuns, ttsSettings, ttsAvailability, demographicSurvey] = await Promise.all([
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

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <header className="card p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-sm text-[var(--muted)]">Account settings</p>
              <AppShellNav current="settings" />
            </div>
            <div>
              <h1 className="font-bold text-2xl">{user.name || user.email}</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">Manage billing, digest cadence, demographic profile, and default voice settings.</p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          <Link className="card p-4 transition hover:border-slate-300 hover:bg-slate-50 sm:p-5" href="/app/podcast-apps">
            <h2 className="text-lg font-semibold">Podcast Apps</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Open the dedicated feed setup page for copy actions, app-specific guidance, and future walkthrough videos.</p>
          </Link>
          <Link className="card p-4 transition hover:border-slate-300 hover:bg-slate-50 sm:p-5" href="/app/chrome-extension">
            <h2 className="text-lg font-semibold">Chrome Extension</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Open the extension page for install, pairing, and setup documentation that can evolve independently.</p>
          </Link>
        </section>

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
          feedUrl={null}
          isAdmin={user.role === "ADMIN"}
          digestFeedUrl={null}
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

        {user.role === "ADMIN" ? (
          <section className="card p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Admin</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Open the admin dashboard for analytics, feedback triage, and operational tools.</p>
            <div className="mt-3">
              <Link className="inline-flex rounded-lg border px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:border-slate-300 hover:bg-slate-50" href="/admin">
                Open admin dashboard
              </Link>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
