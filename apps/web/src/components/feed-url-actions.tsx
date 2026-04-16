"use client";

import { type ReactNode, useCallback, useMemo, useState } from "react";
import { CopyableValueBox } from "@/components/copyable-value-box";
import {
  AntennaPodIcon,
  ApplePodcastsIcon,
  CastroIcon,
  OvercastIcon,
  PocketCastsIcon,
  YouTubeMusicIcon,
} from "@/components/podcast-app-icons";
import { copyText } from "@/lib/copy-text";

type Props = {
  feedUrl: string | null;
  unavailableMessage?: string | null;
  autoFocusPrimaryAction?: boolean;
  allowFeedReplacement?: boolean;
  feedManagementStatusMessage?: string | null;
  isReplacingFeedUrl?: boolean;
  onReplaceFeedUrl?: () => void;
};

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  const ua = navigator.userAgent || "";
  const isIos =
    /iPad|iPhone|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (isIos) {
    return "ios";
  }
  if (/Android/i.test(ua)) {
    return "android";
  }
  return "desktop";
}

function openUrl(url: string, options?: { sameTab?: boolean }): void {
  if (options?.sameTab) {
    window.location.assign(url);
    return;
  }

  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) {
    window.location.assign(url);
  }
}

/** Try a custom URL scheme; fall back to a web URL after a short delay. */
const DEEP_LINK_FALLBACK_DELAY_MS = 1200; // time to wait before checking if the app opened
const DEEP_LINK_VISIBILITY_THRESHOLD_MS = 2000; // if tab is still visible after this long, the app did not open

function tryDeepLink(
  appSchemeUrl: string,
  webFallbackUrl: string,
  options?: { sameTabFallback?: boolean },
): void {
  const start = Date.now();
  window.location.assign(appSchemeUrl);
  window.setTimeout(() => {
    if (
      document.visibilityState === "visible" &&
      Date.now() - start < DEEP_LINK_VISIBILITY_THRESHOLD_MS
    ) {
      openUrl(webFallbackUrl, { sameTab: options?.sameTabFallback });
    }
  }, DEEP_LINK_FALLBACK_DELAY_MS);
}

const APPLE_PODCASTS_WEB_URL = "https://podcasts.apple.com/";
const POCKET_CASTS_WEB_URL = "https://pca.st/";
const OVERCAST_WEB_URL = "https://overcast.fm/";
const CASTRO_WEB_URL = "https://castro.fm/";
const ANTENNAPOD_WEB_URL = "https://antennapod.org/";
const YOUTUBE_MUSIC_WEB_URL = "https://music.youtube.com/";
const YOUTUBE_MUSIC_ANDROID_INTENT_URL =
  "intent://music.youtube.com/#Intent;scheme=https;package=com.google.android.apps.youtube.music;S.browser_fallback_url=https%3A%2F%2Fmusic.youtube.com%2F;end";

type ShortcutButtonProps = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "featured" | "default";
};

function ShortcutButton({
  icon,
  label,
  onClick,
  tone = "default",
}: ShortcutButtonProps) {
  const className =
    tone === "featured"
      ? "inline-flex w-full items-center gap-2 rounded-xl border border-[rgba(31,122,90,0.14)] bg-[rgba(223,243,236,0.28)] px-3 py-2.5 text-sm font-medium text-[var(--ink)] transition hover:border-[rgba(31,122,90,0.24)] hover:bg-white"
      : "inline-flex w-full items-center gap-2 rounded-xl border border-[rgba(31,42,31,0.12)] bg-slate-50/60 px-3 py-2.5 text-sm font-medium text-[var(--ink)] transition hover:border-slate-300 hover:bg-white";

  return (
    <button className={className} onClick={onClick} type="button">
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function FeedUrlActions({
  feedUrl,
  unavailableMessage = null,
  autoFocusPrimaryAction = false,
  allowFeedReplacement = false,
  feedManagementStatusMessage = null,
  isReplacingFeedUrl = false,
  onReplaceFeedUrl,
}: Props) {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const platform = useMemo(() => detectPlatform(), []);
  const sameTabFallback = platform !== "desktop";

  const copyFeedUrl = useCallback(async (): Promise<boolean> => {
    if (!feedUrl) {
      return false;
    }
    return copyText(feedUrl);
  }, [feedUrl]);

  const openApplePodcasts = useCallback(async () => {
    const copied = await copyFeedUrl();
    const copyPrefix = copied
      ? "Feed URL copied."
      : "Could not copy automatically.";

    if (platform === "ios") {
      setStatusMessage(`${copyPrefix} Opening Apple Podcasts…`);
      const encoded = encodeURIComponent(feedUrl ?? "");
      tryDeepLink(
        `podcasts://subscribe?url=${encoded}`,
        APPLE_PODCASTS_WEB_URL,
        { sameTabFallback },
      );
      return;
    }

    openUrl(APPLE_PODCASTS_WEB_URL, { sameTab: sameTabFallback });
    setStatusMessage(`${copyPrefix} Opened Apple Podcasts.`);
  }, [copyFeedUrl, feedUrl, platform, sameTabFallback]);

  const openPocketCasts = useCallback(async () => {
    const copied = await copyFeedUrl();
    const copyPrefix = copied
      ? "Feed URL copied."
      : "Could not copy automatically.";
    const encoded = encodeURIComponent(feedUrl ?? "");

    if (platform === "ios" || platform === "android") {
      setStatusMessage(`${copyPrefix} Opening Pocket Casts…`);
      tryDeepLink(`pktc://subscribe/${encoded}`, POCKET_CASTS_WEB_URL, {
        sameTabFallback,
      });
      return;
    }

    openUrl(POCKET_CASTS_WEB_URL, { sameTab: sameTabFallback });
    setStatusMessage(`${copyPrefix} Opened Pocket Casts.`);
  }, [copyFeedUrl, feedUrl, platform, sameTabFallback]);

  const openOvercast = useCallback(async () => {
    const copied = await copyFeedUrl();
    const copyPrefix = copied
      ? "Feed URL copied."
      : "Could not copy automatically.";
    const encoded = encodeURIComponent(feedUrl ?? "");

    if (platform === "ios") {
      setStatusMessage(`${copyPrefix} Opening Overcast…`);
      tryDeepLink(
        `overcast://x-callback-url/add?url=${encoded}`,
        OVERCAST_WEB_URL,
        { sameTabFallback },
      );
      return;
    }

    openUrl(OVERCAST_WEB_URL, { sameTab: sameTabFallback });
    setStatusMessage(
      `${copyPrefix} Opened Overcast (iOS only — use your browser to copy the feed URL there).`,
    );
  }, [copyFeedUrl, feedUrl, platform, sameTabFallback]);

  const openCastro = useCallback(async () => {
    const copied = await copyFeedUrl();
    const copyPrefix = copied
      ? "Feed URL copied."
      : "Could not copy automatically.";
    const encoded = encodeURIComponent(feedUrl ?? "");

    if (platform === "ios") {
      setStatusMessage(`${copyPrefix} Opening Castro…`);
      tryDeepLink(`castro://subscribe/${encoded}`, CASTRO_WEB_URL, {
        sameTabFallback,
      });
      return;
    }

    openUrl(CASTRO_WEB_URL, { sameTab: sameTabFallback });
    setStatusMessage(
      `${copyPrefix} Opened Castro (iOS only — use your browser to copy the feed URL there).`,
    );
  }, [copyFeedUrl, feedUrl, platform, sameTabFallback]);

  const openAntennaPod = useCallback(async () => {
    const copied = await copyFeedUrl();
    const copyPrefix = copied
      ? "Feed URL copied."
      : "Could not copy automatically.";
    const encoded = encodeURIComponent(feedUrl ?? "");

    if (platform === "android") {
      setStatusMessage(`${copyPrefix} Opening AntennaPod…`);
      tryDeepLink(`antennapod-subscribe://${encoded}`, ANTENNAPOD_WEB_URL, {
        sameTabFallback,
      });
      return;
    }

    openUrl(ANTENNAPOD_WEB_URL, { sameTab: sameTabFallback });
    setStatusMessage(
      `${copyPrefix} Opened AntennaPod (Android only — use your browser to copy the feed URL there).`,
    );
  }, [copyFeedUrl, feedUrl, platform, sameTabFallback]);

  const openYoutubeMusic = useCallback(async () => {
    const copied = await copyFeedUrl();
    const copyPrefix = copied
      ? "Feed URL copied."
      : "Could not copy automatically.";

    if (platform === "android") {
      setStatusMessage(`${copyPrefix} Opening YouTube Music…`);
      tryDeepLink(YOUTUBE_MUSIC_ANDROID_INTENT_URL, YOUTUBE_MUSIC_WEB_URL, {
        sameTabFallback: true,
      });
      return;
    }

    if (platform === "ios") {
      setStatusMessage(`${copyPrefix} Opening YouTube Music…`);
      openUrl(YOUTUBE_MUSIC_WEB_URL, { sameTab: true });
      return;
    }

    openUrl(YOUTUBE_MUSIC_WEB_URL);
    setStatusMessage(`${copyPrefix} Opened YouTube Music.`);
  }, [copyFeedUrl, platform]);

  const featuredApps = [
    {
      icon: <ApplePodcastsIcon />,
      label: "Apple Podcasts",
      onClick: () => {
        void openApplePodcasts();
      },
    },
    {
      icon: <YouTubeMusicIcon />,
      label: "YouTube Music",
      onClick: () => {
        void openYoutubeMusic();
      },
    },
  ] as const;

  const otherApps = [
    {
      icon: <PocketCastsIcon />,
      label: "Pocket Casts",
      onClick: () => {
        void openPocketCasts();
      },
    },
    {
      icon: <OvercastIcon />,
      label: "Overcast",
      onClick: () => {
        void openOvercast();
      },
    },
    {
      icon: <CastroIcon />,
      label: "Castro",
      onClick: () => {
        void openCastro();
      },
    },
    {
      icon: <AntennaPodIcon />,
      label: "AntennaPod",
      onClick: () => {
        void openAntennaPod();
      },
    },
  ] as const;

  const feedManagementPanel =
    allowFeedReplacement && onReplaceFeedUrl ? (
      <div className="mt-4 rounded-xl border border-[rgba(31,122,90,0.16)] bg-white/80 p-3 sm:p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Feed actions
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm sm:w-auto"
            disabled={isReplacingFeedUrl}
            onClick={onReplaceFeedUrl}
            type="button"
          >
            {isReplacingFeedUrl
              ? "Generating..."
              : "Generate new private feed URL"}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Use this only if the current URL was shared or you need to replace it
          everywhere. Generating a new URL revokes the old one immediately.
        </p>
        {feedManagementStatusMessage ? (
          <p aria-live="polite" className="mt-2 text-xs text-[var(--muted)]">
            {feedManagementStatusMessage}
          </p>
        ) : null}
      </div>
    ) : null;

  if (!feedUrl) {
    return (
      <section className="rounded-2xl border border-[rgba(31,122,90,0.18)] bg-[var(--accent-soft)]/55 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Step 1
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          {unavailableMessage ||
            "Your current private feed is still active, but this older URL can no longer be shown here. Keep using the URL already added in your podcast app unless you decide to replace it."}
        </p>
        {feedManagementPanel}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[rgba(31,122,90,0.18)] bg-[var(--accent-soft)]/55 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Step 1
        </p>
        <CopyableValueBox
          autoFocus={autoFocusPrimaryAction}
          copiedMessage="Feed URL copied."
          idleMessage="Tap or click the box to copy your private feed URL."
          label="Private feed URL"
          tone="accent"
          value={feedUrl}
        />
        {feedManagementPanel}
        <p className="mt-3 text-sm text-[var(--muted)]">
          Copy this first. Each app names the next step a little differently, so
          refer to{" "}
          <a
            className="font-medium text-[var(--ink)] underline decoration-[rgba(31,122,90,0.35)] underline-offset-2 transition hover:text-[var(--accent)]"
            href="#app-walkthroughs"
          >
            the app walkthroughs below
          </a>{" "}
          if you&apos;re not sure where to paste the feed URL.
        </p>
      </section>

      <section className="rounded-2xl border border-[rgba(31,42,31,0.1)] bg-white p-4 sm:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Step 2
          </p>
          <h3 className="mt-1 text-sm font-semibold text-[var(--ink)]">
            Open a podcast app
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            These shortcuts copy the feed URL first, then try to open the app.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Featured apps
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {featuredApps.map((app) => (
                <ShortcutButton
                  key={app.label}
                  icon={app.icon}
                  label={app.label}
                  onClick={app.onClick}
                  tone="featured"
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Other podcast apps
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {otherApps.map((app) => (
                <ShortcutButton
                  key={app.label}
                  icon={app.icon}
                  label={app.label}
                  onClick={app.onClick}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
      <p className="text-xs text-[var(--muted)]">
        Tapping a button copies your feed URL and tries to open the app first on
        mobile.
      </p>
      {statusMessage ? (
        <p aria-live="polite" className="text-xs text-[var(--muted)]">
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
