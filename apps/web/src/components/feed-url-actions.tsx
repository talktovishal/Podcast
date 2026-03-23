"use client";

import { useCallback, useMemo, useState } from "react";
import { CopyableValueBox } from "@/components/copyable-value-box";
import { copyText } from "@/lib/copy-text";

type Props = {
  feedUrl: string;
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

export function FeedUrlActions({ feedUrl }: Props) {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const platform = useMemo(() => detectPlatform(), []);

  const copyFeedUrl = useCallback(async (): Promise<boolean> => {
    return copyText(feedUrl);
  }, [feedUrl]);

  const openApplePodcasts = useCallback(async () => {
    const copied = await copyFeedUrl();
    const copyPrefix = copied ? "Feed URL copied." : "Could not copy automatically.";

    if (platform === "ios") {
      setStatusMessage(`${copyPrefix} Opening Apple Podcasts app...`);
      window.location.assign("podcasts://");
      window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          window.location.assign("https://podcasts.apple.com/");
          setStatusMessage(`${copyPrefix} If the app did not open, Apple Podcasts web is now open.`);
        }
      }, 1200);
      return;
    }

    openUrl("https://podcasts.apple.com/");
    setStatusMessage(`${copyPrefix} Opened Apple Podcasts.`);
  }, [copyFeedUrl, platform]);

  const openYoutubeMusic = useCallback(async () => {
    const copied = await copyFeedUrl();
    const copyPrefix = copied ? "Feed URL copied." : "Could not copy automatically.";
    openUrl("https://music.youtube.com/");
    setStatusMessage(`${copyPrefix} Opened YouTube Music.`);
  }, [copyFeedUrl]);

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
      <div className="mt-2 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        <button
          className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto"
          onClick={() => {
            void openApplePodcasts();
          }}
        >
          Open Apple Podcasts
        </button>
        <button
          className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto"
          onClick={() => {
            void openYoutubeMusic();
          }}
        >
          Open YouTube Music
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">Paste your copied feed URL inside the app&apos;s Add by URL flow.</p>
      {statusMessage ? (
        <p aria-live="polite" className="mt-1 text-xs text-[var(--muted)]">
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
