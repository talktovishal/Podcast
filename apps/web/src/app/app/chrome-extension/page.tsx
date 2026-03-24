import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTtsCatalog, normalizeTtsSelection } from "@articlepod/core";
import { AppShellNav } from "@/components/app-shell-nav";
import { DashboardClient } from "@/components/dashboard-client";
import { getAuthUserFromCookies } from "@/lib/auth";
import { getUserTtsSettings } from "@/lib/dashboard";
import { getTtsProviderAvailability } from "@/lib/tts";

export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

export default async function ChromeExtensionPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const [ttsSettings, ttsAvailability] = await Promise.all([getUserTtsSettings(user.id), getTtsProviderAvailability()]);
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
              <p className="text-sm text-[var(--muted)]">Capture setup</p>
              <AppShellNav current="chrome-extension" />
            </div>
            <div className="space-y-1">
              <h1 className="font-bold text-2xl">Chrome Extension</h1>
              <p className="text-sm text-[var(--muted)]">Install the capture extension, pair it once, and keep setup notes and future walkthrough videos in a page of its own.</p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
          <div className="card p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Quick start</h2>
            <ol className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li>1. Install the extension from the Chrome Web Store.</li>
              <li>2. Generate a one-time connect code here and paste it into the extension.</li>
              <li>3. Once paired, the extension stays connected for a year unless you revoke it.</li>
            </ol>
          </div>
          <div className="card p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Walkthroughs</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              We can now add short setup videos and troubleshooting notes here later without competing with episode creation on the main workspace.
            </p>
          </div>
        </section>

        <DashboardClient
          viewMode="chrome-extension"
          feedUrl={null}
          isAdmin={user.role === "ADMIN"}
          initialTtsSelection={normalizedSelection}
          ttsCatalog={ttsCatalog}
          ttsAvailability={ttsAvailability}
          initialItems={[]}
        />
      </div>
    </main>
  );
}
