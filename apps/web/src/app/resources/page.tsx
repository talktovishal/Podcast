import Link from "next/link";
import type { ComponentType } from "react";
import type { Metadata } from "next";
import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";
import {
  AntennaPodIcon,
  ApplePodcastsIcon,
  CastroIcon,
  OvercastIcon,
  PocketCastsIcon,
  YouTubeMusicIcon,
} from "@/components/podcast-app-icons";
import { SeoJsonLd } from "@/components/seo-json-ld";
import { getAuthUserFromCookies } from "@/lib/auth";
import { CHROME_WEB_STORE_URL } from "@/lib/chrome-extension";
import {
  buildBreadcrumbSchema,
  buildHowToSchema,
  buildPublicMetadata,
} from "@/lib/seo";

const resourcesDescription =
  "Learn the two easiest ways to use ArticlePod: save articles faster with the Chrome extension and listen in Apple Podcasts, Pocket Casts, Overcast, AntennaPod, and other podcast apps.";

type ResourceCard = {
  title: string;
  description: string;
};

type SupportedApp = {
  Icon: ComponentType<{ className?: string }>;
  name: string;
  platform: string;
  description: string;
};

const captureHighlights: ResourceCard[] = [
  {
    title: "Save from the page you already have open",
    description:
      "When you find a longread worth hearing later, the extension lets you send it to ArticlePod without bouncing back to the dashboard.",
  },
  {
    title: "Perfect for newsletters, essays, and research trails",
    description:
      "It fits the moments where good articles pile up faster than you can revisit them.",
  },
  {
    title: "Built for a one-time setup, then everyday use",
    description:
      "Once it is connected to your account, saving from Chrome feels like a quick part of your normal reading flow.",
  },
];

const listeningFlow: ResourceCard[] = [
  {
    title: "1. Save articles as you go",
    description:
      "Build up your listening queue while you browse, read newsletters, or collect background material for later.",
  },
  {
    title: "2. Add your ArticlePod show once",
    description:
      "Inside the app, we walk you through adding your personal ArticlePod show to the podcast player you already use.",
  },
  {
    title: "3. Let your usual listening routine take over",
    description:
      "New episodes land in the same place you already reach for on walks, commutes, workouts, or chores.",
  },
];

const supportedApps: SupportedApp[] = [
  {
    Icon: ApplePodcastsIcon,
    name: "Apple Podcasts",
    platform: "iPhone, iPad, Mac",
    description:
      "The cleanest choice if most of your listening already happens in Apple's ecosystem.",
  },
  {
    Icon: PocketCastsIcon,
    name: "Pocket Casts",
    platform: "iPhone, Android, Web",
    description:
      "A great fit if you want one polished library that stays in sync across devices.",
  },
  {
    Icon: OvercastIcon,
    name: "Overcast",
    platform: "iPhone, iPad",
    description:
      "A favorite for iPhone listeners who want a focused app with strong queue control.",
  },
  {
    Icon: CastroIcon,
    name: "Castro",
    platform: "iPhone, iPad",
    description:
      "Helpful when you like an inbox-style approach and want to triage what to hear next.",
  },
  {
    Icon: AntennaPodIcon,
    name: "AntennaPod",
    platform: "Android",
    description:
      "An excellent Android-first option if you want a clean, dependable podcast home.",
  },
  {
    Icon: YouTubeMusicIcon,
    name: "YouTube Music",
    platform: "iPhone, Android, Web",
    description:
      "Worth trying when your listening habit already lives inside Google and YouTube's ecosystem.",
  },
];

export const metadata: Metadata = buildPublicMetadata({
  title: "Chrome extension and podcast app resources",
  description: resourcesDescription,
  path: "/resources",
  keywords: [
    "articlepod chrome extension",
    "save article to podcast",
    "browser article capture",
    "podcast app setup",
    "listen to articles in apple podcasts",
  ],
});

function ResourceMiniCard({ title, description }: ResourceCard) {
  return (
    <article className="rounded-2xl border border-[rgba(31,122,90,0.15)] bg-white/90 p-4">
      <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        {description}
      </p>
    </article>
  );
}

function SupportedAppCard({ Icon, name, platform, description }: SupportedApp) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white/90 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)]/70">
          <Icon className="h-8 w-8" />
        </span>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-[var(--ink)]">{name}</h3>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#4d7b72]">
            {platform}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
        {description}
      </p>
    </article>
  );
}

export default async function ResourcesPage() {
  const user = await getAuthUserFromCookies();
  const appSetupHref = user ? "/app/chrome-extension" : "/";
  const appSetupLabel = user ? "Open Chrome setup" : "Start with ArticlePod";
  const heroPodcastHref = user ? "/app/podcast-apps" : "#podcast-apps";
  const heroPodcastLabel = user
    ? "Open podcast app guides"
    : "See supported apps";
  const appGuideHref = user ? "/app/podcast-apps" : "/";
  const appGuideLabel = user
    ? "Open podcast app guides"
    : "Sign in for app guides";

  return (
    <>
      <SeoJsonLd
        data={[
          buildHowToSchema({
            name: "Use ArticlePod with Chrome and your favorite podcast app",
            description: resourcesDescription,
            path: "/resources",
            steps: [
              {
                name: "Install the extension",
                text: "Install the ArticlePod Chrome extension from the Chrome Web Store.",
              },
              {
                name: "Save an article while browsing",
                text: "Send the article you already have open in Chrome straight to ArticlePod.",
              },
              {
                name: "Open your show in a podcast app",
                text: "Add your personal ArticlePod show in Apple Podcasts, Pocket Casts, or another supported app.",
              },
              {
                name: "Press play later",
                text: "Catch up from the same podcast player you already use during the rest of your day.",
              },
            ],
          }),
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Resources", path: "/resources" },
          ]),
        ]}
      />

      <main className="min-h-screen py-6 sm:py-10">
        <div className="container-shell space-y-6">
          <MarketingHeader activeHref="/resources" />
          <header className="card overflow-hidden p-5 sm:p-6">
            <div className="grid gap-6 lg:grid-cols-[1.18fr_0.82fr] lg:items-end">
              <div className="space-y-4">
                <p className="inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5] px-4 py-1 text-xs font-semibold text-[#0f6a54] sm:text-sm">
                  Resources
                </p>
                <div className="space-y-2">
                  <h1 className="max-w-4xl text-4xl font-bold leading-tight sm:text-5xl">
                    Save in Chrome. Listen in the podcast app you already use.
                  </h1>
                  <p className="max-w-3xl text-base text-[var(--muted)] sm:text-lg">
                    ArticlePod works best when it slips into the tools you
                    already reach for: the browser where you discover good
                    reading and the podcast app you already trust for catching
                    up later.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <a
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                    href={CHROME_WEB_STORE_URL}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Add to Chrome
                  </a>
                  <Link
                    className="rounded-lg border border-[#bfded4] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)]"
                    href={appSetupHref}
                  >
                    {appSetupLabel}
                  </Link>
                  <Link
                    className="rounded-lg border border-[#bfded4] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)]"
                    href={heroPodcastHref}
                  >
                    {heroPodcastLabel}
                  </Link>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <ResourceMiniCard
                  title="Chrome extension first"
                  description='The fastest route from "I should read this later" to "I can listen to it later" is saving the page already open in your browser.'
                />
                <ResourceMiniCard
                  title="Podcast apps you know"
                  description="Apple Podcasts, Pocket Casts, Overcast, Castro, AntennaPod, and more can stay part of the same listening routine."
                />
                <ResourceMiniCard
                  title="A simpler habit"
                  description="The goal is not another inbox to manage. It is a smoother path from saving great writing to actually hearing it."
                />
              </div>
            </div>
          </header>

          <section
            className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]"
            id="chrome-extension"
          >
            <article className="card p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
                Chrome extension
              </p>
              <h2 className="mt-2 max-w-2xl text-2xl font-semibold leading-tight">
                The fastest way to save an article is from the page you already
                have open.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                If your best reading happens in browser tabs, the extension is
                the easiest route. It keeps ArticlePod close to the moment you
                find something worth hearing later instead of forcing you back
                through a separate dashboard flow every time.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {captureHighlights.map((item) => (
                  <ResourceMiniCard
                    key={item.title}
                    title={item.title}
                    description={item.description}
                  />
                ))}
              </div>
            </article>

            <aside className="card p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Quick start</h2>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted)]">
                <li>1. Add ArticlePod Capture from the Chrome Web Store.</li>
                <li>
                  2. Sign in to ArticlePod and finish the short account setup
                  once.
                </li>
                <li>
                  3. Save the article you are reading directly from Chrome
                  whenever something is worth keeping.
                </li>
                <li>
                  4. Come back later and press play in the podcast app you
                  already use.
                </li>
              </ol>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white"
                  href={CHROME_WEB_STORE_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Add to Chrome
                </a>
                <Link
                  className="rounded-lg border border-[#bfded4] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)]"
                  href={appSetupHref}
                >
                  {user ? "Finish setup inside the app" : "Create your account"}
                </Link>
              </div>
            </aside>
          </section>

          <section className="card p-5 sm:p-6" id="podcast-apps">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
                  Podcast apps
                </p>
                <h2 className="max-w-3xl text-2xl font-semibold leading-tight">
                  Keep listening in the player you already trust.
                </h2>
                <p className="max-w-3xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                  ArticlePod is designed so saved reading can land in the same
                  podcast queue you already rely on. No new player to learn, no
                  separate listening habit to maintain.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  className="rounded-lg border border-[#bfded4] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)]"
                  href={appGuideHref}
                >
                  {appGuideLabel}
                </Link>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {supportedApps.map((app) => (
                <SupportedAppCard key={app.name} {...app} />
              ))}
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {listeningFlow.map((item) => (
                <ResourceMiniCard
                  key={item.title}
                  title={item.title}
                  description={item.description}
                />
              ))}
            </div>
          </section>

          <section className="card bg-[var(--accent-soft)]/45 p-5 sm:p-6">
            <h2 className="max-w-3xl text-2xl font-semibold leading-tight">
              The best version of ArticlePod feels almost invisible.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)] sm:text-base">
              Use Chrome when you discover something worth saving. Use your
              usual podcast app when it is time to catch up. That simple handoff
              is the whole point of the product.
            </p>
          </section>

          <MarketingCta
            secondaryHref="/product"
            secondaryLabel="See how it works"
          />
        </div>
      </main>
    </>
  );
}
