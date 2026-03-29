import type { Metadata } from "next";
import { BillingSettingsCard } from "@/components/billing-settings-card";
import { redirect } from "next/navigation";
import { getTtsCatalog, normalizeTtsSelection } from "@articlepod/core";
import { AppShellNav } from "@/components/app-shell-nav";
import { DashboardClient } from "@/components/dashboard-client";
import Link from "next/link";
import { ensureUserDigestSettings, getAuthUserFromCookies } from "@/lib/auth";
import {
  getBillingAccountSnapshot,
  isBillingPlanCheckoutConfigured,
} from "@/lib/billing";
import {
  getRecentDigestRuns,
  getUserDemographicSurvey,
  getUserTtsSettings,
} from "@/lib/dashboard";
import { getTtsProviderAvailability } from "@/lib/tts";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppSettingsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const [
    digestSettings,
    digestRuns,
    ttsSettings,
    ttsAvailability,
    demographicSurvey,
  ] = await Promise.all([
    ensureUserDigestSettings(user.id),
    getRecentDigestRuns(user.id, 20),
    getUserTtsSettings(user.id),
    getTtsProviderAvailability(),
    getUserDemographicSurvey(user.id),
  ]);
  const billing = await getBillingAccountSnapshot(user.id);
  const monthlyCheckoutConfigured = isBillingPlanCheckoutConfigured("PRO_MONTHLY");
  const annualCheckoutConfigured = isBillingPlanCheckoutConfigured("PRO_ANNUAL");
  const billingSearchParam = Array.isArray(searchParams?.billing)
    ? searchParams?.billing[0]
    : searchParams?.billing;
  const normalizedSelection = normalizeTtsSelection({
    providerId: ttsSettings.providerId,
    voice: ttsSettings.voice,
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
              <p className="mt-1 text-sm text-[var(--muted)]">
                Manage your default voice, digest cadence, billing, and the rest
                of your account preferences.
              </p>
            </div>
          </div>
        </header>

        <DashboardClient
          viewMode="settings"
          settingsSections={["voice", "digest"]}
          feedUrl={null}
          isAdmin={user.role === "ADMIN"}
          initialDigestSettings={{
            timezone: digestSettings.timezone,
            dailyEmailEnabled: digestSettings.dailyEmailEnabled,
            dailyPodcastEnabled: digestSettings.dailyPodcastEnabled,
            dailyHour: digestSettings.dailyHour,
            dailyMinute: digestSettings.dailyMinute,
            dailyLengthMinutes: digestSettings.dailyLengthMinutes as
              | 5
              | 15
              | 30,
            weeklyEmailEnabled: digestSettings.weeklyEmailEnabled,
            weeklyPodcastEnabled: digestSettings.weeklyPodcastEnabled,
            weeklyDayOfWeek: digestSettings.weeklyDayOfWeek,
            weeklyHour: digestSettings.weeklyHour,
            weeklyMinute: digestSettings.weeklyMinute,
            weeklyLengthMinutes: digestSettings.weeklyLengthMinutes as
              | 5
              | 15
              | 30,
          }}
          initialTtsSelection={normalizedSelection}
          ttsCatalog={ttsCatalog}
          ttsAvailability={ttsAvailability}
          initialItems={[]}
        />

        <BillingSettingsCard
          activationHint={billingSearchParam === "success"}
          annualCheckoutConfigured={annualCheckoutConfigured}
          initialBilling={billing}
          monthlyCheckoutConfigured={monthlyCheckoutConfigured}
        />

        <DashboardClient
          viewMode="settings"
          settingsSections={["demographics", "digest-runs"]}
          feedUrl={null}
          isAdmin={user.role === "ADMIN"}
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
            podcastStatus: run.podcastStatus,
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
            <p className="mt-1 text-sm text-[var(--muted)]">
              Open the admin dashboard for analytics, feedback triage, and
              operational tools.
            </p>
            <div className="mt-3">
              <Link
                className="inline-flex rounded-lg border px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:border-slate-300 hover:bg-slate-50"
                href="/admin"
              >
                Open admin dashboard
              </Link>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
