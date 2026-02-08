import Link from "next/link";
import { redirect } from "next/navigation";
import { getTtsCatalog, normalizeTtsSelection } from "@listenlater/core";
import { DashboardClient } from "@/components/dashboard-client";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { LogoutButton } from "@/components/logout-button";
import { ensureUserFeedToken, getAuthUserFromCookies } from "@/lib/auth";
import { getDashboardItems, getUserTtsSettings } from "@/lib/dashboard";
import { env } from "@/lib/env";
import { getTtsProviderAvailability } from "@/lib/tts";

export default async function AppDashboardPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const [feedToken, items, ttsSettings, ttsAvailability] = await Promise.all([
    ensureUserFeedToken(user.id),
    getDashboardItems(user.id),
    getUserTtsSettings(user.id),
    getTtsProviderAvailability()
  ]);
  const normalizedSelection = normalizeTtsSelection({
    providerId: ttsSettings.providerId,
    voice: ttsSettings.voice
  });
  const ttsCatalog = getTtsCatalog();

  return (
    <main className="py-8">
      <div className="container-shell space-y-6">
        <header className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm text-[var(--muted)]">Signed in as</p>
            <h1 className="font-bold text-2xl">{user.name || user.email}</h1>
          </div>

          <div className="flex flex-wrap gap-2">
            {user.role === "ADMIN" ? (
              <Link className="rounded-lg border px-3 py-1.5 text-sm" href="/admin">
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
          feedUrl={`${env.appUrl}/rss/${feedToken}.xml`}
          feedToken={feedToken}
          initialTtsSelection={normalizedSelection}
          ttsCatalog={ttsCatalog}
          ttsAvailability={ttsAvailability}
          initialItems={items.map((item) => ({
            id: item.id,
            title: item.title,
            sourceType: item.sourceType,
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
