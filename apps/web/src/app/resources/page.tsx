import type { Metadata } from "next";
import { ChromeExtensionGuidePanels } from "@/components/chrome-extension-guide-panels";
import { ChromeExtensionSetupCard } from "@/components/chrome-extension-setup-card";
import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";
import { getAuthUserFromCookies } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Set up the ArticlePod Chrome extension with the same walkthrough used inside the signed-in app, while keeping the connect code hidden until login.",
  alternates: { canonical: "/resources" }
};

export default async function ResourcesPage() {
  const user = await getAuthUserFromCookies();

  return (
    <main className="min-h-screen py-6 sm:py-10">
      <div className="container-shell space-y-6">
        <MarketingHeader activeHref="/resources" />
        <header className="card p-5 sm:p-6">
          <div className="space-y-3">
            <p className="inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5] px-4 py-1 text-xs font-semibold text-[#0f6a54] sm:text-sm">
              Resources
            </p>
            <div className="space-y-1">
              <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">Chrome Extension</h1>
              <p className="max-w-3xl text-base text-[var(--muted)] sm:text-lg">
                Use the same extension setup flow here that you see inside the signed-in app. When you are logged out, the page keeps the
                connect code hidden and only shows the safe public steps.
              </p>
            </div>
          </div>
        </header>

        <ChromeExtensionSetupCard id="chrome-extension" isAuthenticated={Boolean(user)} />
        <ChromeExtensionGuidePanels />

        <MarketingCta />
      </div>
    </main>
  );
}
