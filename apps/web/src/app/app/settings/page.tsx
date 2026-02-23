import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTtsCatalog, normalizeTtsSelection } from "@articlepod/core";
import { DashboardClient } from "@/components/dashboard-client";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { LogoutButton } from "@/components/logout-button";
import { ensureUserFeedToken, getAuthUserFromCookies } from "@/lib/auth";
import { getUserTtsSettings } from "@/lib/dashboard";
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

  const [feedToken, ttsSettings, ttsAvailability] = await Promise.all([
    ensureUserFeedToken(user.id),
    getUserTtsSettings(user.id),
    getTtsProviderAvailability()
  ]);
  const normalizedSelection = normalizeTtsSelection({
    providerId: ttsSettings.providerId,
    voice: ttsSettings.voice
  });
  const ttsCatalog = getTtsCatalog();
  const feedUrl = `${env.appUrl}/rss/${feedToken}.xml`;

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <header className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-sm text-[var(--muted)]">Account settings</p>
            <h1 className="font-bold text-2xl">{user.name || user.email}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Manage feed access, extension auth, and default voice.</p>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Link className="rounded-lg bg-[var(--accent)] px-3 py-2 text-center text-sm font-semibold text-white" href="/app">
              Back to episodes
            </Link>
            {user.role === "ADMIN" ? (
              <Link className="rounded-lg border px-3 py-2 text-center text-sm" href="/admin">
                Admin
              </Link>
            ) : null}
            <DeleteAccountButton />
            <LogoutButton />
          </div>
        </header>

        <DashboardClient
          viewMode="settings"
          feedUrl={feedUrl}
          feedToken={feedToken}
          initialTtsSelection={normalizedSelection}
          ttsCatalog={ttsCatalog}
          ttsAvailability={ttsAvailability}
          initialItems={[]}
        />
      </div>
    </main>
  );
}
