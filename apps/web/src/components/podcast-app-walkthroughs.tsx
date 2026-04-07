import Image from "next/image";
import type { ReactNode } from "react";
import {
  AntennaPodIcon,
  ApplePodcastsIcon,
  CastroIcon,
  OvercastIcon,
  PocketCastsIcon,
  YouTubeMusicIcon,
} from "@/components/podcast-app-icons";

type StepProps = {
  number: number;
  children: ReactNode;
};

function Step({ number, children }: StepProps) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-bold">
        {number}
      </span>
      <span className="text-sm text-[var(--muted)]">{children}</span>
    </li>
  );
}

type AppWalkthroughProps = {
  icon: ReactNode;
  name: string;
  platform: string;
  intro?: ReactNode;
  steps: ReactNode[];
  tip?: ReactNode;
  extra?: ReactNode;
};

function AppWalkthrough({
  icon,
  name,
  platform,
  intro,
  steps,
  tip,
  extra,
}: AppWalkthroughProps) {
  return (
    <details className="group rounded-xl border bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-[var(--accent-soft)] text-xl">
          {icon}
        </span>
        <div className="flex-1">
          <p className="font-semibold">{name}</p>
          <p className="text-xs text-[var(--muted)]">{platform}</p>
        </div>
        <span
          className="ml-auto text-[var(--muted)] transition-transform group-open:rotate-180"
          aria-hidden
        >
          ▾
        </span>
      </summary>

      <div className="border-t px-4 pb-5 pt-4 sm:px-5">
        {intro ? (
          <p className="mb-4 text-sm text-[var(--muted)]">{intro}</p>
        ) : null}
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <Step key={i} number={i + 1}>
              {step}
            </Step>
          ))}
        </ol>
        {tip ? (
          <div className="mt-4 rounded-lg border border-[#c9e4dc] bg-[#edf8f5] px-4 py-3 text-sm text-[#0f6a54]">
            💡 {tip}
          </div>
        ) : null}
        {extra ? <div className="mt-4">{extra}</div> : null}
      </div>
    </details>
  );
}

// ─── Screen-mock helper ────────────────────────────────────────────────────────
// Used inside step text to show a styled UI element name (menu item, button, tab).

function Ui({ children }: { children: ReactNode }) {
  return (
    <strong className="rounded border border-neutral-300 bg-neutral-100 px-1 py-0.5 text-xs font-semibold not-italic text-neutral-700">
      {children}
    </strong>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function PodcastAppWalkthroughs() {
  return (
    <div className="space-y-3">
      {/* Apple Podcasts */}
      <AppWalkthrough
        icon={<ApplePodcastsIcon className="h-6 w-6" />}
        name="Apple Podcasts"
        platform="iPhone · iPad · Mac"
        steps={[
          <>
            Tap the button above — your feed URL is copied and Apple Podcasts
            opens automatically.
          </>,
          <>
            In Apple Podcasts on iPhone, tap the <Ui>Library</Ui> tab at the
            bottom.
          </>,
          <>
            Tap <Ui>Edit</Ui> (top-right corner), then tap{" "}
            <Ui>Add a Show by URL…</Ui>
          </>,
          <>
            Paste your feed URL (already in your clipboard) and tap{" "}
            <Ui>Subscribe</Ui>.
          </>,
          <>Your podcast will appear in your Library within a few seconds.</>,
        ]}
        tip="On Mac, open Podcasts, choose File → Follow a Podcast, and paste the URL."
      />

      {/* YouTube Music */}
      <AppWalkthrough
        icon={<YouTubeMusicIcon className="h-6 w-6" />}
        name="YouTube Music"
        platform="iPhone · Android · Web"
        intro={
          <>
            Tap the YouTube Music button above first so your private feed URL is
            already copied, then follow these steps.
          </>
        }
        steps={[
          <>Open the YouTube Music app.</>,
          <>
            Tap <Ui>Library</Ui>.
          </>,
          <>
            Tap <Ui>Podcasts</Ui> at the top.
          </>,
          <>
            Tap <Ui>Add podcast</Ui> in the bottom-right corner.
          </>,
          <>
            Tap <Ui>Add a podcast by RSS feed</Ui>.
          </>,
          <>Read the disclaimer and accept it.</>,
          <>Paste the full RSS/XML feed URL.</>,
          <>
            Tap <Ui>Add</Ui>.
          </>,
        ]}
        tip={
          <>
            If you do not see the RSS option yet, make sure YouTube Music is up
            to date and compare with the official help page below.
          </>
        }
        extra={
          <div className="space-y-3">
            <a
              className="inline-flex items-center gap-2 rounded-lg border border-[rgba(31,122,90,0.2)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-semibold text-[var(--accent)] transition hover:border-[rgba(31,122,90,0.34)] hover:bg-[rgba(223,243,236,0.82)]"
              href="https://support.google.com/youtubemusic/answer/13946190?hl=en"
              rel="noreferrer"
              target="_blank"
            >
              Read the official YouTube Music help page
              <span aria-hidden>↗</span>
            </a>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mx-auto max-w-[221px] overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-sm">
                <Image
                  alt="Animated walkthrough showing where to add a podcast by RSS feed in the YouTube Music mobile app."
                  className="h-auto w-full"
                  height={480}
                  priority={false}
                  src="/resources/youtube-music-add-podcast.gif"
                  unoptimized
                  width={221}
                />
              </div>
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                Preview of the YouTube Music add-by-RSS flow.
              </p>
            </div>
          </div>
        }
      />

      {/* Pocket Casts */}
      <AppWalkthrough
        icon={<PocketCastsIcon className="h-6 w-6" />}
        name="Pocket Casts"
        platform="iPhone · Android · Web"
        steps={[
          <>
            Tap the button above — your feed URL is copied and Pocket Casts
            opens automatically on mobile.
          </>,
          <>
            In Pocket Casts, tap the <Ui>Discover</Ui> tab (magnifying-glass
            icon), then tap the <Ui>URL</Ui> field at the top.
          </>,
          <>
            Alternatively, go to <Ui>Profile</Ui> → <Ui>Settings</Ui> →{" "}
            <Ui>Import from OPML or URL</Ui> on some versions.
          </>,
          <>
            Paste your feed URL and tap <Ui>Subscribe</Ui>.
          </>,
          <>
            The show appears under <Ui>Podcasts</Ui> in your library.
          </>,
        ]}
        tip="Pocket Casts syncs across all your devices — subscribe once, listen everywhere."
      />

      {/* Overcast */}
      <AppWalkthrough
        icon={<OvercastIcon className="h-6 w-6" />}
        name="Overcast"
        platform="iPhone · iPad (iOS only)"
        steps={[
          <>
            Tap the button above — your feed URL is copied and the Overcast
            add-URL screen opens automatically on iPhone.
          </>,
          <>
            If the app does not open automatically, launch Overcast and tap the{" "}
            <Ui>+</Ui> button (top-right corner of the Podcasts list).
          </>,
          <>
            Tap <Ui>Add URL</Ui> and paste your feed URL.
          </>,
          <>
            Tap <Ui>Subscribe to Feed</Ui>. The podcast appears in your
            subscriptions.
          </>,
        ]}
        tip="Overcast is free with optional Premium. It's iOS/iPadOS only — Android users should try Pocket Casts or AntennaPod instead."
      />

      {/* Castro */}
      <AppWalkthrough
        icon={<CastroIcon className="h-6 w-6" />}
        name="Castro"
        platform="iPhone · iPad (iOS only)"
        steps={[
          <>
            Tap the button above — your feed URL is copied and Castro opens
            automatically on iPhone.
          </>,
          <>
            In Castro, tap the <Ui>Discover</Ui> tab (magnifying-glass icon at
            the bottom).
          </>,
          <>
            Tap the search bar and paste your feed URL, then tap <Ui>Return</Ui>
            .
          </>,
          <>
            Castro finds the feed — tap <Ui>Subscribe</Ui> to add it to your
            library.
          </>,
        ]}
        tip="Castro queues episodes rather than auto-downloading everything. Great for high-volume feeds."
      />

      {/* AntennaPod */}
      <AppWalkthrough
        icon={<AntennaPodIcon className="h-6 w-6" />}
        name="AntennaPod"
        platform="Android"
        steps={[
          <>
            Tap the button above — your feed URL is copied and AntennaPod opens
            automatically on Android.
          </>,
          <>
            In AntennaPod, tap <Ui>Add Podcast</Ui> (the <Ui>+</Ui> icon in the
            bottom-right corner).
          </>,
          <>
            Tap <Ui>Add podcast by RSS address</Ui>.
          </>,
          <>
            Paste your feed URL and tap <Ui>Confirm</Ui>.
          </>,
          <>
            Tap <Ui>Subscribe</Ui> on the podcast preview screen.
          </>,
        ]}
        tip="AntennaPod is free and open-source. It's Android only — iPhone users should use Apple Podcasts, Overcast, or Castro."
      />
    </div>
  );
}
