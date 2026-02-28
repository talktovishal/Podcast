"use client";

import { useCallback, useMemo, useState } from "react";

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

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to textarea copy path.
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export function FeedUrlActions({ feedUrl }: Props) {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const platform = useMemo(() => detectPlatform(), []);

  const copyFeedUrl = useCallback(async (): Promise<boolean> => {
    const copied = await copyText(feedUrl);
    setStatusMessage(copied ? "Feed URL copied." : "Could not copy automatically. Please copy manually.");
    return copied;
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
      <p className="mt-2 text-xs text-[var(--muted)]">Private feed URL</p>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-start">
        <code className="block max-w-full flex-1 overflow-x-auto rounded-md bg-slate-100 p-2 text-xs">{feedUrl}</code>
        <button
          aria-label="Copy private feed URL"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border"
          onClick={() => {
            void copyFeedUrl();
          }}
          title="Copy private feed URL"
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <rect height="13" rx="2" width="13" x="9" y="9" />
            <rect height="13" rx="2" width="13" x="2" y="2" />
          </svg>
        </button>
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
