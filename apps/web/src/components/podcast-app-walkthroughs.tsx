import type { ReactNode } from "react";

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
  steps: ReactNode[];
  tip?: ReactNode;
};

function AppWalkthrough({ icon, name, platform, steps, tip }: AppWalkthroughProps) {
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
        <span className="ml-auto text-[var(--muted)] transition-transform group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>

      <div className="border-t px-4 pb-5 pt-4 sm:px-5">
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
      </div>
    </details>
  );
}

// ─── Inline SVG icons ──────────────────────────────────────────────────────────

function ApplePodcastsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" fill="none">
      <rect width="24" height="24" rx="5" fill="#8B5CF6" />
      <circle cx="12" cy="10" r="3" fill="white" />
      <path d="M8 20c0-2.21 1.79-5 4-5s4 2.79 4 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M5 10a7 7 0 0 1 14 0" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function PocketCastsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#F43F22" />
      <circle cx="12" cy="12" r="3" fill="white" />
      <path
        d="M7 12a5 5 0 0 1 5-5M17 12a5 5 0 0 1-5 5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M4.5 12a7.5 7.5 0 0 1 7.5-7.5M19.5 12a7.5 7.5 0 0 1-7.5 7.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function OvercastIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#FC7E0F" />
      <circle cx="12" cy="12" r="3" fill="white" />
      <path d="M5.5 18.5a9.5 9.5 0 0 1 0-13M18.5 5.5a9.5 9.5 0 0 1 0 13" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function CastroIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#00B265" />
      <circle cx="12" cy="12" r="4" fill="white" />
      <circle cx="12" cy="12" r="2" fill="#00B265" />
      <path d="M12 2 L12 6M12 18 L12 22M2 12 L6 12M18 12 L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function AntennaPodIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#FF6B2B" />
      <path d="M12 5 L12 19M8 9 L12 5 L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="12" cy="14" r="3" fill="white" />
    </svg>
  );
}

function YouTubeMusicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#FF0000" />
      <circle cx="12" cy="12" r="6" fill="white" />
      <circle cx="12" cy="12" r="2.5" fill="#FF0000" />
      <path d="M10.5 9 L15.5 12 L10.5 15 Z" fill="#FF0000" />
    </svg>
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
        icon={<ApplePodcastsIcon />}
        name="Apple Podcasts"
        platform="iPhone · iPad · Mac"
        steps={[
          <>Tap the button above — your feed URL is copied and Apple Podcasts opens automatically.</>,
          <>
            In Apple Podcasts on iPhone, tap the <Ui>Library</Ui> tab at the bottom.
          </>,
          <>
            Tap <Ui>Edit</Ui> (top-right corner), then tap <Ui>Add a Show by URL…</Ui>
          </>,
          <>
            Paste your feed URL (already in your clipboard) and tap <Ui>Subscribe</Ui>.
          </>,
          <>Your podcast will appear in your Library within a few seconds.</>,
        ]}
        tip="On Mac, open Podcasts, choose File → Follow a Podcast, and paste the URL."
      />

      {/* Pocket Casts */}
      <AppWalkthrough
        icon={<PocketCastsIcon />}
        name="Pocket Casts"
        platform="iPhone · Android · Web"
        steps={[
          <>Tap the button above — your feed URL is copied and Pocket Casts opens automatically on mobile.</>,
          <>
            In Pocket Casts, tap the <Ui>Discover</Ui> tab (magnifying-glass icon), then tap the <Ui>URL</Ui> field at the top.
          </>,
          <>
            Alternatively, go to <Ui>Profile</Ui> → <Ui>Settings</Ui> → <Ui>Import from OPML or URL</Ui> on some versions.
          </>,
          <>Paste your feed URL and tap <Ui>Subscribe</Ui>.</>,
          <>The show appears under <Ui>Podcasts</Ui> in your library.</>,
        ]}
        tip="Pocket Casts syncs across all your devices — subscribe once, listen everywhere."
      />

      {/* Overcast */}
      <AppWalkthrough
        icon={<OvercastIcon />}
        name="Overcast"
        platform="iPhone · iPad (iOS only)"
        steps={[
          <>Tap the button above — your feed URL is copied and the Overcast add-URL screen opens automatically on iPhone.</>,
          <>
            If the app does not open automatically, launch Overcast and tap the <Ui>+</Ui> button (top-right corner of the Podcasts list).
          </>,
          <>
            Tap <Ui>Add URL</Ui> and paste your feed URL.
          </>,
          <>
            Tap <Ui>Subscribe to Feed</Ui>. The podcast appears in your subscriptions.
          </>,
        ]}
        tip="Overcast is free with optional Premium. It's iOS/iPadOS only — Android users should try Pocket Casts or AntennaPod instead."
      />

      {/* Castro */}
      <AppWalkthrough
        icon={<CastroIcon />}
        name="Castro"
        platform="iPhone · iPad (iOS only)"
        steps={[
          <>Tap the button above — your feed URL is copied and Castro opens automatically on iPhone.</>,
          <>
            In Castro, tap the <Ui>Discover</Ui> tab (magnifying-glass icon at the bottom).
          </>,
          <>
            Tap the search bar and paste your feed URL, then tap <Ui>Return</Ui>.
          </>,
          <>
            Castro finds the feed — tap <Ui>Subscribe</Ui> to add it to your library.
          </>,
        ]}
        tip="Castro queues episodes rather than auto-downloading everything. Great for high-volume feeds."
      />

      {/* AntennaPod */}
      <AppWalkthrough
        icon={<AntennaPodIcon />}
        name="AntennaPod"
        platform="Android"
        steps={[
          <>Tap the button above — your feed URL is copied and AntennaPod opens automatically on Android.</>,
          <>
            In AntennaPod, tap <Ui>Add Podcast</Ui> (the <Ui>+</Ui> icon in the bottom-right corner).
          </>,
          <>
            Tap <Ui>Add podcast by RSS address</Ui>.
          </>,
          <>Paste your feed URL and tap <Ui>Confirm</Ui>.</>,
          <>
            Tap <Ui>Subscribe</Ui> on the podcast preview screen.
          </>,
        ]}
        tip="AntennaPod is free and open-source. It's Android only — iPhone users should use Apple Podcasts, Overcast, or Castro."
      />

      {/* YouTube Music */}
      <AppWalkthrough
        icon={<YouTubeMusicIcon />}
        name="YouTube Music"
        platform="iPhone · Android · Web"
        steps={[
          <>Tap the button above — your feed URL is copied and YouTube Music opens.</>,
          <>
            In YouTube Music, tap your <Ui>profile picture</Ui> (top-right), then tap <Ui>Settings</Ui>.
          </>,
          <>
            Scroll to <Ui>Privacy and location</Ui> → <Ui>Podcast subscriptions</Ui> and tap <Ui>Add podcast by URL</Ui>.
          </>,
          <>Paste your feed URL and tap <Ui>Subscribe</Ui>.</>,
          <>
            Your podcast appears under <Ui>Library</Ui> → <Ui>Podcasts</Ui>.
          </>,
        ]}
        tip="YouTube Music RSS support is rolling out gradually — if the option is not visible yet, try again after the next app update."
      />
    </div>
  );
}
