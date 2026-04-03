import type { Metadata } from "next";
import { ChromeExtensionGuidePanels } from "@/components/chrome-extension-guide-panels";
import { ChromeExtensionSetupCard } from "@/components/chrome-extension-setup-card";
import { MarketingCta } from "@/components/marketing-cta";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { SeoJsonLd } from "@/components/seo-json-ld";
import { getAuthUserFromCookies } from "@/lib/auth";
import {
  buildBreadcrumbSchema,
  buildHowToSchema,
  buildPublicMetadata
} from "@/lib/seo";

const resourcesDescription =
  "Set up the ArticlePod Chrome extension for faster article capture. Follow the same walkthrough used inside the app while keeping the connect code hidden until login.";

export const metadata: Metadata = buildPublicMetadata({
  title: "Chrome extension resources",
  description: resourcesDescription,
  path: "/resources",
  keywords: [
    "articlepod chrome extension",
    "save article to podcast",
    "browser article capture",
    "chrome extension article to audio"
  ]
});

export default async function ResourcesPage() {
  const user = await getAuthUserFromCookies();

  return (
    <>
      <SeoJsonLd
        data={[
          buildHowToSchema({
            name: "Set up the ArticlePod Chrome extension",
            description: resourcesDescription,
            path: "/resources",
            steps: [
              {
                name: "Install the extension",
                text: "Install the ArticlePod Chrome extension from the Chrome Web Store."
              },
              {
                name: "Copy a connect code",
                text: "Open the resources page while signed in and copy the one-time connect code."
              },
              {
                name: "Pair the extension",
                text: "Paste the connect code into the extension so it can submit captures to your account."
              },
              {
                name: "Capture an article",
                text: "Open an article page in Chrome and submit it to your private podcast feed with one click."
              }
            ]
          }),
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Resources", path: "/resources" }
          ])
        ]}
      />

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
                  Use the same extension setup flow here that you see inside the signed-in app. When you are logged out, the page keeps
                  the connect code hidden and only shows the safe public steps.
                </p>
              </div>
            </div>
          </header>

          <section className="grid gap-4 lg:grid-cols-3">
            <article className="card p-5">
              <h2 className="text-lg font-semibold">Why use the extension</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                The extension is the fastest way to turn the article already open in your browser into a private podcast episode without
                copy-pasting a URL back into the dashboard.
              </p>
            </article>
            <article className="card p-5">
              <h2 className="text-lg font-semibold">What stays private</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Public visitors can read the setup guide here, but the one-time connect code is only generated for signed-in users so your
                private feed details stay protected.
              </p>
            </article>
            <article className="card p-5">
              <h2 className="text-lg font-semibold">What to do next</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Install the extension, pair it, and then return to your Episodes page to watch processing status or hear the finished
                result in your podcast app.
              </p>
            </article>
          </section>

          <ChromeExtensionSetupCard id="chrome-extension" isAuthenticated={Boolean(user)} />
          <ChromeExtensionGuidePanels />

          <MarketingCta secondaryHref="/faq" secondaryLabel="Read the FAQ" />
          <MarketingFooter />
        </div>
      </main>
    </>
  );
}
