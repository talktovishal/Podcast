"use client";

import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/copy-text";

type Props = {
  label: string;
  value: string;
  copiedMessage: string;
  failedMessage?: string;
  idleMessage?: string;
  autoFocus?: boolean;
  tone?: "default" | "accent";
  valueClassName?: string;
  className?: string;
};

type FeedbackState =
  | {
      kind: "success" | "error";
      message: string;
    }
  | null;

const SUCCESS_RESET_MS = 2500;

export function CopyableValueBox({
  label,
  value,
  copiedMessage,
  failedMessage = "Could not copy automatically. Please copy manually.",
  idleMessage = `Tap or click the box to copy the ${label.toLowerCase()}.`,
  autoFocus = false,
  tone = "default",
  valueClassName = "text-xs",
  className = ""
}: Props) {
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      buttonRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [autoFocus]);

  async function handleCopy() {
    if (!value.trim()) {
      return;
    }

    const copied = await copyText(value);

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    if (copied) {
      setFeedback({ kind: "success", message: copiedMessage });
      resetTimerRef.current = window.setTimeout(() => {
        setFeedback(null);
        resetTimerRef.current = null;
      }, SUCCESS_RESET_MS);
      return;
    }

    setFeedback({ kind: "error", message: failedMessage });
  }

  const isCopied = feedback?.kind === "success";
  const badgeLabel = isCopied ? "Copied" : "Copy";
  const statusMessage = feedback?.message ?? idleMessage;
  const statusClassName =
    feedback?.kind === "success"
      ? "text-emerald-700"
      : feedback?.kind === "error"
        ? "text-rose-600"
        : "text-[var(--muted)]";
  const labelClassName =
    tone === "accent"
      ? "text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]"
      : "text-sm text-[var(--muted)]";
  const buttonClassName =
    tone === "accent"
      ? "group relative mt-2 block w-full rounded-2xl border border-[rgba(31,122,90,0.34)] bg-[rgba(223,243,236,0.82)] px-4 py-4 text-left shadow-[0_0_0_1px_rgba(31,122,90,0.06)] transition hover:border-[rgba(31,122,90,0.42)] hover:bg-[rgba(223,243,236,0.94)] focus:outline-none focus:ring-4 focus:ring-[rgba(31,122,90,0.16)]"
      : "group relative mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-slate-300 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35";
  const badgeClassName = isCopied
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : tone === "accent"
      ? "border-[rgba(31,122,90,0.18)] bg-white/92 text-[var(--accent)] group-hover:border-[rgba(31,122,90,0.28)]"
      : "border-slate-200 bg-white/95 text-slate-600 group-hover:border-slate-300 group-hover:text-slate-900";

  return (
    <div className={className}>
      <p className={labelClassName}>{label}</p>
      <button
        aria-label={`Copy ${label}`}
        className={buttonClassName}
        ref={buttonRef}
        onClick={() => {
          void handleCopy();
        }}
        type="button"
      >
        <span
          className={`pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm transition ${badgeClassName}`}
        >
          {isCopied ? (
            <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M5 12.5 9.5 17 19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <rect height="11" rx="2" width="11" x="9" y="9" />
              <rect height="11" rx="2" width="11" x="4" y="4" />
            </svg>
          )}
          {badgeLabel}
        </span>
        <code className={`block break-all pr-20 font-mono leading-6 text-slate-900 ${valueClassName}`}>{value}</code>
      </button>
      <p aria-live="polite" className={`mt-2 text-xs ${statusClassName}`}>
        {statusMessage}
      </p>
    </div>
  );
}
