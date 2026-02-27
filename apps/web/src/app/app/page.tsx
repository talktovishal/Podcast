import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTtsCatalog, normalizeTtsSelection } from "@articlepod/core";
import { DashboardClient } from "@/components/dashboard-client";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { LogoutButton } from "@/components/logout-button";
import { ensureUserFeedToken, getAuthUserFromCookies } from "@/lib/auth";
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
  const [feedToken, items, ttsSettings, ttsAvailability, demoDiagnostics, submissionQuota] = await Promise.all([
    ensureUserFeedToken(user.id),
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
  const feedUrl = `${env.appUrl}/rss/${feedToken}.xml`;

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <header className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-sm text-[var(--muted)]">Signed in as</p>
            <h1 className="font-bold text-2xl">{user.name || user.email}</h1>
            <p className="mt-2 text-xs text-[var(--muted)]">Private feed URL</p>
            <code className="mt-1 block max-w-full overflow-x-auto rounded-md bg-slate-100 p-2 text-xs">{feedUrl}</code>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Link className="rounded-lg bg-[var(--accent)] px-3 py-2 text-center text-sm font-semibold text-white" href="/app/settings">
              Settings
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

        <section className="card p-4">
          <p className="text-sm font-medium">Demo mode ready</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Starter content is available immediately. You can submit URLs or PDFs and watch worker status transition in real time.
          </p>
        </section>

        <DashboardClient
          viewMode="workspace"
          feedUrl={feedUrl}
          feedToken={feedToken}
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
