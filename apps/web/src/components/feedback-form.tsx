"use client";

import { useState } from "react";
import { FEEDBACK_FEATURE_AREAS, FEEDBACK_TYPES, feedbackFeatureAreaLabel, feedbackTypeLabel } from "@/lib/feedback";

type CreateFeedbackResponse = {
  ok: boolean;
  feedback?: {
    id: string;
    mirrorStatus: string;
  };
  error_message?: string;
};

export function FeedbackForm() {
  const [message, setMessage] = useState("");
  const [feedbackType, setFeedbackType] = useState<string>("");
  const [featureArea, setFeatureArea] = useState<string>("");
  const [allowEmailContact, setAllowEmailContact] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function submitFeedback() {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setStatusMessage("Please enter feedback before submitting.");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          message: trimmedMessage,
          feedbackType: feedbackType || null,
          featureArea: featureArea || null,
          allowEmailContact,
          sourcePath: typeof window === "undefined" ? null : window.location.pathname
        })
      });
      const payload = (await response.json()) as CreateFeedbackResponse;
      if (!response.ok || !payload.ok) {
        setStatusMessage(payload.error_message || "We could not submit your feedback.");
        return;
      }

      setMessage("");
      setFeedbackType("");
      setFeatureArea("");
      setAllowEmailContact(true);
      setStatusMessage("Thanks — your feedback was received.");
    } catch {
      setStatusMessage("We could not submit your feedback.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Share feedback</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">Tell us anything that is not working or could be better.</p>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium">Your feedback *</span>
        <textarea
          className="min-h-36 w-full rounded-lg border px-3 py-2"
          maxLength={5000}
          placeholder="What should we improve?"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-medium">Type (optional)</span>
        <select
          className="w-full rounded-lg border px-3 py-2"
          value={feedbackType}
          onChange={(event) => setFeedbackType(event.target.value)}
        >
          <option value="">Unspecified</option>
          {FEEDBACK_TYPES.map((value) => (
            <option key={value} value={value}>
              {feedbackTypeLabel(value)}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-medium">Feature area (optional)</span>
        <select
          className="w-full rounded-lg border px-3 py-2"
          value={featureArea}
          onChange={(event) => setFeatureArea(event.target.value)}
        >
          <option value="">Unspecified</option>
          {FEEDBACK_FEATURE_AREAS.map((value) => (
            <option key={value} value={value}>
              {feedbackFeatureAreaLabel(value)}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={allowEmailContact} onChange={(event) => setAllowEmailContact(event.target.checked)} />
        You may contact me by email about this feedback
      </label>

      <div className="mt-4">
        <button
          className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
          disabled={isSubmitting || !message.trim()}
          onClick={submitFeedback}
        >
          {isSubmitting ? "Submitting..." : "Submit feedback"}
        </button>
      </div>

      {statusMessage ? (
        <p aria-live="polite" className="mt-3 text-sm text-[var(--muted)]">
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}
