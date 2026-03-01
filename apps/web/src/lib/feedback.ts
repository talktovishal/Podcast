export const FEEDBACK_TYPES = ["BUG", "FEATURE", "GENERAL", "OTHER"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_FEATURE_AREAS = [
  "INGEST",
  "PLAYBACK",
  "RSS_FEED",
  "SETTINGS",
  "DIGEST",
  "EXTENSION",
  "ADMIN",
  "OTHER"
] as const;
export type FeedbackFeatureArea = (typeof FEEDBACK_FEATURE_AREAS)[number];

export const FEEDBACK_STATUSES = ["NEW", "IN_REVIEW", "PLANNED", "DONE", "DECLINED"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_MIRROR_STATUSES = ["PENDING", "MIRRORED", "FAILED", "SKIPPED"] as const;
export type FeedbackMirrorStatus = (typeof FEEDBACK_MIRROR_STATUSES)[number];

export function feedbackTypeLabel(value: FeedbackType | null | undefined): string {
  if (!value) {
    return "Unspecified";
  }
  if (value === "BUG") {
    return "Bug report";
  }
  if (value === "FEATURE") {
    return "Feature idea";
  }
  if (value === "GENERAL") {
    return "General feedback";
  }
  return "Other";
}

export function feedbackFeatureAreaLabel(value: FeedbackFeatureArea | null | undefined): string {
  if (!value) {
    return "Unspecified";
  }
  if (value === "INGEST") {
    return "Ingest";
  }
  if (value === "PLAYBACK") {
    return "Playback";
  }
  if (value === "RSS_FEED") {
    return "RSS feed";
  }
  if (value === "SETTINGS") {
    return "Settings";
  }
  if (value === "DIGEST") {
    return "Digest";
  }
  if (value === "EXTENSION") {
    return "Extension";
  }
  if (value === "ADMIN") {
    return "Admin";
  }
  return "Other";
}
