import Image from "next/image";
import Link from "next/link";
import type { ComponentType } from "react";
import type { Metadata } from "next";
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

type SupportedApp = {
  Icon: ComponentType<{ className?: string }>;
  name: string;
  platform: string;
};

const supportedApps: SupportedApp[] = [
  {
    Icon: ApplePodcastsIcon,
    name: "Apple Podcasts",
    platform: "iPhone, iPad, Mac",
  },
  {
    Icon: PocketCastsIcon,
    name: "Pocket Casts",
    platform: "iPhone, Android, Web",
  },
  {
    Icon: OvercastIcon,
    name: "Overcast",
    platform: "iPhone, iPad",
  },
  {
    Icon: CastroIcon,
    name: "Castro",
    platform: "iPhone, iPad",
  },
  {
    Icon: AntennaPodIcon,
    name: "AntennaPod",
    platform: "Android",
  },
  {
    Icon: YouTubeMusicIcon,
    name: "YouTube Music",
    platform: "iPhone, Android, Web",
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

function SupportedAppCard({ Icon, name, platform }: SupportedApp) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white/90 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)]/70">
          <Icon className="h-7 w-7" />
        </span>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-[var(--ink)]">{name}</h3>
          <p className="text-xs text-[var(--muted)]">{platform}</p>
        </div>
      </div>
    </article>
  );
}

export default async function ResourcesPage() {
  const user = await getAuthUserFromCookies();
  const appSetupHref = user ? "/app/chrome-extension" : "/";
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

      <header className="card p-5 sm:p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="max-w-4xl text-4xl font-bold leading-tight sm:text-5xl">
              Save in Chrome. Listen in the podcast app you already use.
            </h1>
            <p className="max-w-3xl text-base text-[var(--muted)] sm:text-lg">
              ArticlePod works best when it stays close to the tools you
              already reach for.
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
              href={heroPodcastHref}
            >
              {heroPodcastLabel}
            </Link>
          </div>
        </div>
      </header>

      <section className="mt-6 card p-5 sm:p-6" id="chrome-extension">
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
                Chrome extension
              </p>
              <p className="text-sm font-semibold text-[var(--ink)]">
                The best version of ArticlePod feels almost invisible.
              </p>
              <h2 className="max-w-2xl text-2xl font-semibold leading-tight">
                Capture the page you are already reading.
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                Connect once, then save articles straight from Chrome
                without bouncing back to the dashboard.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
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
                {user
                  ? "Finish setup inside the app"
                  : "Create your account"}
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-[rgba(31,122,90,0.15)] bg-white p-3">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <Image
                alt="Animated walkthrough of the ArticlePod Chrome extension connect and capture flow."
                className="h-auto w-full"
                height={1027}
                priority={false}
                src="/resources/articlepod-extension-flow.gif"
                unoptimized
                width={800}
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              One quick connection, then you can capture the current page in
              a click.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 card p-5 sm:p-6" id="podcast-apps">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
              Podcast apps
            </p>
            <h2 className="max-w-3xl text-2xl font-semibold leading-tight">
              Keep listening in the player you already trust.
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-[var(--muted)] sm:text-base">
              Apple Podcasts, Pocket Casts, Overcast, Castro, AntennaPod,
              and YouTube Music can stay part of the same routine.
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

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {supportedApps.map((app) => (
            <SupportedAppCard key={app.name} {...app} />
          ))}
        </div>
      </section>
    </>
  );
}
