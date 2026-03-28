"use client";

import { useCallback, useMemo, useState } from "react";
import { CopyableValueBox } from "@/components/copyable-value-box";
import { copyText } from "@/lib/copy-text";

type Props = {
  feedUrl: string | null;
  unavailableMessage?: string | null;
};

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  const ua = navigator.userAgent || "";
  const isIos = /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (isIos) {
    return "ios";
  }
  if (/Android/i.test(ua)) {
    return "android";
  }
  return "desktop";
}

function openUrl(url: string): void {
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) {
    window.location.assign(url);
  }
}

/** Try a custom URL scheme; fall back to a web URL after a short delay. */
const DEEP_LINK_FALLBACK_DELAY_MS = 1200; // time to wait before checking if the app opened
const DEEP_LINK_VISIBILITY_THRESHOLD_MS = 2000; // if tab is still visible after this long, the app did not open

function tryDeepLink(appSchemeUrl: string, webFallbackUrl: string): void {
  const start = Date.now();
  window.location.assign(appSchemeUrl);
  window.setTimeout(() => {
    if (document.visibilityState === "visible" && Date.now() - start < DEEP_LINK_VISIBILITY_THRESHOLD_MS) {
      openUrl(webFallbackUrl);
    }
  }, DEEP_LINK_FALLBACK_DELAY_MS);
}

export function FeedUrlActions({ feedUrl, unavailableMessage = null }: Props) {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const platform = useMemo(() => detectPlatform(), []);

  const copyFeedUrl = useCallback(async (): Promise<boolean> => {
    if (!feedUrl) {
      return false;
    }
    return copyText(feedUrl);
  }, [feedUrl]);

  const openApplePodcasts = useCallback(async () => {
    const copied = await copyFeedUrl();
    const copyPrefix = copied ? "Feed URL copied." : "Could not copy automatically.";

    if (platform === "ios") {
      setStatusMessage(`${copyPrefix} Opening Apple Podcasts…`);
      // Try to deep-link directly to the "Add a Show by URL" flow
      const encoded = encodeURIComponent(feedUrl ?? "");
      tryDeepLink(`podcasts://subscribe?url=${encoded}`, "https://podcasts.apple.com/");
      return;
    }

    openUrl("https://podcasts.apple.com/");
    setStatusMessage(`${copyPrefix} Opened Apple Podcasts.`);
  }, [copyFeedUrl, feedUrl, platform]);

  const openPocketCasts = useCallback(async () => {
    const copied = await copyFeedUrl();
    const copyPrefix = copied ? "Feed URL copied." : "Could not copy automatically.";
    const encoded = encodeURIComponent(feedUrl ?? "");

    if (platform === "ios" || platform === "android") {
      setStatusMessage(`${copyPrefix} Opening Pocket Casts…`);
      tryDeepLink(`pktc://subscribe/${encoded}`, "https://pca.st/");
      return;
    }

    openUrl("https://pca.st/");
    setStatusMessage(`${copyPrefix} Opened Pocket Casts.`);
  }, [copyFeedUrl, feedUrl, platform]);

  const openOvercast = useCallback(async () => {
    const copied = await copyFeedUrl();
    const copyPrefix = copied ? "Feed URL copied." : "Could not copy automatically.";
    const encoded = encodeURIComponent(feedUrl ?? "");

    if (platform === "ios") {
      setStatusMessage(`${copyPrefix} Opening Overcast…`);
      tryDeepLink(`overcast://x-callback-url/add?url=${encoded}`, "https://overcast.fm/");
      return;
    }

    openUrl("https://overcast.fm/");
    setStatusMessage(`${copyPrefix} Opened Overcast (iOS only — use your browser to copy the feed URL there).`);
  }, [copyFeedUrl, feedUrl, platform]);

  const openCastro = useCallback(async () => {
    const copied = await copyFeedUrl();
    const copyPrefix = copied ? "Feed URL copied." : "Could not copy automatically.";
    const encoded = encodeURIComponent(feedUrl ?? "");

    if (platform === "ios") {
      setStatusMessage(`${copyPrefix} Opening Castro…`);
      tryDeepLink(`castro://subscribe/${encoded}`, "https://castro.fm/");
      return;
    }

    openUrl("https://castro.fm/");
    setStatusMessage(`${copyPrefix} Opened Castro (iOS only — use your browser to copy the feed URL there).`);
  }, [copyFeedUrl, feedUrl, platform]);

  const openAntennaPod = useCallback(async () => {
    const copied = await copyFeedUrl();
    const copyPrefix = copied ? "Feed URL copied." : "Could not copy automatically.";
    const encoded = encodeURIComponent(feedUrl ?? "");

    if (platform === "android") {
      setStatusMessage(`${copyPrefix} Opening AntennaPod…`);
      tryDeepLink(`antennapod-subscribe://${encoded}`, "https://antennapod.org/");
      return;
    }

    openUrl("https://antennapod.org/");
    setStatusMessage(`${copyPrefix} Opened AntennaPod (Android only — use your browser to copy the feed URL there).`);
  }, [copyFeedUrl, feedUrl, platform]);

  const openYoutubeMusic = useCallback(async () => {
    const copied = await copyFeedUrl();
    const copyPrefix = copied ? "Feed URL copied." : "Could not copy automatically.";
    openUrl("https://music.youtube.com/");
    setStatusMessage(`${copyPrefix} Opened YouTube Music.`);
  }, [copyFeedUrl]);

  if (!feedUrl) {
    return (
      <div className="mt-2">
        <p className="text-sm text-[var(--muted)]">
          {unavailableMessage ||
            "Your current private feed is still active, but this legacy URL can no longer be shown here. Rotate the token from Settings only when you are ready to re-add the new URL in your podcast app."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mt-2">
        <CopyableValueBox
          copiedMessage="Feed URL copied."
          idleMessage="Tap or click the box to copy your private feed URL."
          label="Private feed URL"
          value={feedUrl}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={() => {
            void openApplePodcasts();
          }}
        >
          🎙 Apple Podcasts
        </button>
        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={() => {
            void openPocketCasts();
          }}
        >
          🎧 Pocket Casts
        </button>
        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={() => {
            void openOvercast();
          }}
        >
          ☁️ Overcast
        </button>
        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={() => {
            void openCastro();
          }}
        >
          📻 Castro
        </button>
        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={() => {
            void openAntennaPod();
          }}
        >
          📡 AntennaPod
        </button>
        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={() => {
            void openYoutubeMusic();
          }}
        >
          ▶️ YouTube Music
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Tapping a button copies your feed URL and tries to open the app&apos;s &ldquo;Add by URL&rdquo; screen directly on mobile. Paste the copied URL if prompted.
      </p>
      {statusMessage ? (
        <p aria-live="polite" className="mt-1 text-xs text-[var(--muted)]">
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
