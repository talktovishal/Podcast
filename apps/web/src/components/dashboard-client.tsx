"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { copyText } from "@/lib/copy-text";
import type { DemoExtractionDiagnostic } from "@/lib/demo-diagnostics";
import { FeedUrlActions } from "@/components/feed-url-actions";
import {
  DEMOGRAPHIC_AGE_BANDS,
  DEMOGRAPHIC_GENDER_IDENTITIES,
  ageBandLabel,
  genderIdentityLabel,
  type DemographicAgeBand,
  type DemographicGenderIdentity,
  type UserDemographicSurveyView,
} from "@/lib/demographics";
import { mergeItemsPreservingEpisodeTokens } from "@/lib/dashboard-items";
import {
  normalizeItemErrorMessage,
  recommendsChromeExtensionCapture,
} from "@/lib/item-errors";
import { sourceFallbackLabel, sourceTypeBadgeLabel } from "@/lib/source-labels";

type DashboardItem = {
  id: string;
  title: string | null;
  sourceType: string;
  sourceUrl: string | null;
  status: string;
  processingMode: "FULL_EPISODE" | "SUMMARY_ONLY";
  importance: "LOW" | "MEDIUM" | "HIGH";
  tags: string[];
  errorCode: string | null;
  errorMessage: string | null;
  summaryStatus: "NOT_REQUESTED" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  summaryTitle: string | null;
  summaryCompletedAt: string | null;
  summaryErrorCode: string | null;
  summaryErrorMessage: string | null;
  markdownBytes: number | null;
  createdAt: string;
  share: {
    shareId: string;
    shareUrl: string;
  } | null;
  episode: {
    id: string;
    audioPath: string;
    audioBytes: number;
    mimeType: string;
    mediaToken: string;
  } | null;
};

type ItemImportance = "LOW" | "MEDIUM" | "HIGH";

type TtsCatalog = {
  providers: ReadonlyArray<{
    id: string;
    label: string;
    summary: string;
    openSource: boolean;
  }>;
  voicesByProvider: Record<
    string,
    ReadonlyArray<{
      id: string;
      label: string;
      gender?: "male" | "female" | "neutral";
      locale: string;
    }>
  >;
  defaults: {
    providerId: string;
    voiceByProvider: Record<string, string>;
  };
};

type TtsAvailability = Record<
  string,
  {
    available: boolean;
    reason?: string;
  }
>;

type SubmissionQuotaSnapshot = {
  isPaid: boolean;
  submissionCount: number;
  freeTrialSubmissionLimit: number;
  extraSubmissionCredits: number;
  totalFreeSubmissionAllowance: number;
  remainingFreeSubmissions: number | null;
  dailyPodcastLimit: number | null;
  podcastsUsedLast24Hours: number;
  remainingDailyPodcasts: number | null;
  dailySummaryLimit: number | null;
  summariesUsedLast24Hours: number;
  remainingDailySummaries: number | null;
  queuedDeferredPodcasts: number;
  maxDeferredPodcasts: number | null;
};

type DigestSettings = {
  timezone: string;
  dailyEmailEnabled: boolean;
  dailyPodcastEnabled: boolean;
  dailyHour: number;
  dailyMinute: number;
  dailyLengthMinutes: 5 | 15 | 30;
  weeklyEmailEnabled: boolean;
  weeklyPodcastEnabled: boolean;
  weeklyDayOfWeek: number;
  weeklyHour: number;
  weeklyMinute: number;
  weeklyLengthMinutes: 5 | 15 | 30;
};

type SettingsSection = "voice" | "digest" | "demographics";

const WEEKDAY_OPTIONS: Array<{ label: string; value: number }> = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
  { label: "Saturday", value: 6 },
];

const LENGTH_OPTIONS: ReadonlyArray<5 | 15 | 30> = [5, 15, 30];
const DEFAULT_SETTINGS_SECTIONS: ReadonlyArray<SettingsSection> = [
  "voice",
  "digest",
  "demographics",
];
const ACTIVE_REFRESH_INTERVAL_MS = 3000;
const IDLE_REFRESH_INTERVAL_MS = 20000;
const OPTIONAL_DETAILS_STORAGE_KEY = "articlepod.dashboard.optional-details";
const INLINE_ACTION_FEEDBACK_RESET_MS = 2500;
const RECENT_ITEMS_TOAST_RESET_MS = 2600;

type ShareActionFeedback = {
  itemId: string;
  kind: "copied" | "revoked" | "error";
  message: string;
} | null;

type RecentItemsToast = {
  kind: "success" | "error";
  message: string;
} | null;

function defaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const DEFAULT_DIGEST_SETTINGS: DigestSettings = {
  timezone: defaultTimezone(),
  dailyEmailEnabled: false,
  dailyPodcastEnabled: false,
  dailyHour: 16,
  dailyMinute: 0,
  dailyLengthMinutes: 5,
  weeklyEmailEnabled: true,
  weeklyPodcastEnabled: true,
  weeklyDayOfWeek: 5,
  weeklyHour: 16,
  weeklyMinute: 0,
  weeklyLengthMinutes: 15,
};

const DEFAULT_DEMOGRAPHIC_SURVEY: UserDemographicSurveyView = {
  status: "PENDING",
  ageBand: null,
  genderIdentity: null,
  genderSelfDescribe: null,
  completedAt: null,
  skippedAt: null,
  deletedAt: null,
  updatedAt: null,
};

type Props = {
  feedUrl: string | null;
  feedUrlMessage?: string | null;
  workspaceHeading?: string;
  workspaceSubheading?: string;
  isAdmin?: boolean;
  isDemoAccount?: boolean;
  initialSubmissionQuota?: SubmissionQuotaSnapshot | null;
  initialProcessingMode?: "FULL_EPISODE" | "SUMMARY_ONLY";
  initialDigestSettings?: DigestSettings;
  initialDemographicSurvey?: UserDemographicSurveyView;
  initialTtsSelection: {
    providerId: string;
    voice: string;
  };
  ttsCatalog: TtsCatalog;
  ttsAvailability: TtsAvailability;
  readOnly?: boolean;
  viewMode?: "workspace" | "settings" | "podcast-apps";
  settingsSections?: ReadonlyArray<SettingsSection>;
  initialDemoDiagnostics?: DemoExtractionDiagnostic[];
  initialItems: DashboardItem[];
};

function isPendingStatus(status: string): boolean {
  const normalized = status.toUpperCase();
  return normalized === "QUEUED" || normalized === "PROCESSING";
}

function statusHelpText(
  status: string,
  processingMessage?: string | null,
): string | null {
  const normalized = status.toUpperCase();
  if (normalized === "QUEUED") {
    if (processingMessage && processingMessage.trim()) {
      return processingMessage.trim();
    }
    return "Queued. Waiting for worker to start processing.";
  }

  if (normalized === "PROCESSING") {
    if (processingMessage && processingMessage.trim()) {
      return `${processingMessage.trim()} Audio will appear when complete.`;
    }
    return "Processing in progress. Audio will appear when complete.";
  }

  if (normalized === "READY") {
    return "Ready. Episode is available to play and export via RSS.";
  }

  return null;
}

function itemStatusHelpText(item: DashboardItem): string | null {
  const normalized = item.status.toUpperCase();
  if (
    item.processingMode === "SUMMARY_ONLY" &&
    normalized === "READY" &&
    !item.episode
  ) {
    if (item.summaryStatus === "SUCCEEDED") {
      return "Summary is ready. TTS is available on request.";
    }
    if (item.summaryStatus === "FAILED") {
      return item.summaryErrorMessage || "Summary generation failed.";
    }
  }

  if (item.summaryStatus === "PROCESSING") {
    return "Creating summary.";
  }

  return statusHelpText(item.status, item.errorMessage);
}

function summaryStatusLabel(status: string): string {
  switch (status) {
    case "SUCCEEDED":
      return "summary ready";
    case "PROCESSING":
      return "summary processing";
    case "FAILED":
      return "summary failed";
    default:
      return "summary off";
  }
}

function CollapsibleSettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <details className="card overflow-hidden">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
        </div>
        <span className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
          Edit
        </span>
      </summary>
      <div className="border-t px-4 pb-4 pt-4 sm:px-5 sm:pb-5">{children}</div>
    </details>
  );
}

function importanceLabel(importance: string): string {
  switch (importance) {
    case "HIGH":
      return "High";
    case "MEDIUM":
      return "Medium";
    default:
      return "Low";
  }
}

export function DashboardClient({
  feedUrl,
  feedUrlMessage = null,
  workspaceHeading,
  workspaceSubheading,
  isAdmin = false,
  isDemoAccount = false,
  initialSubmissionQuota = null,
  initialProcessingMode = "FULL_EPISODE",
  initialDigestSettings = DEFAULT_DIGEST_SETTINGS,
  initialDemographicSurvey = DEFAULT_DEMOGRAPHIC_SURVEY,
  initialTtsSelection,
  ttsCatalog,
  ttsAvailability,
  readOnly = false,
  viewMode = "workspace",
  settingsSections = DEFAULT_SETTINGS_SECTIONS,
  initialDemoDiagnostics = [],
  initialItems,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [submissionQuota, setSubmissionQuota] = useState(
    initialSubmissionQuota,
  );
  const [processingMode, setProcessingMode] = useState<
    "FULL_EPISODE" | "SUMMARY_ONLY"
  >(initialProcessingMode);
  const [isProcessingModeBusy, setIsProcessingModeBusy] = useState(false);
  const [demoDiagnostics, setDemoDiagnostics] = useState(
    initialDemoDiagnostics,
  );
  const [sourceMode, setSourceMode] = useState<"url" | "pdf">("url");
  const [urlInput, setUrlInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [importanceInput, setImportanceInput] = useState<ItemImportance>("LOW");
  const [tagsInput, setTagsInput] = useState("");
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [
    hasLoadedOptionalDetailsPreference,
    setHasLoadedOptionalDetailsPreference,
  ] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [feedUrlStatusMessage, setFeedUrlStatusMessage] = useState<
    string | null
  >(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isFeedUrlBusy, setIsFeedUrlBusy] = useState(false);
  const [isDigestBusy, setIsDigestBusy] = useState(false);
  const [shareBusyState, setShareBusyState] = useState<{
    itemId: string;
    action: "create" | "revoke";
  } | null>(null);
  const [shareActionFeedback, setShareActionFeedback] =
    useState<ShareActionFeedback>(null);
  const [recentItemsToast, setRecentItemsToast] =
    useState<RecentItemsToast>(null);
  const [deleteBusyItemId, setDeleteBusyItemId] = useState<string | null>(null);
  const [ttsVoice, setTtsVoice] = useState(initialTtsSelection.voice);
  const [digestSettings, setDigestSettings] = useState<DigestSettings>(
    initialDigestSettings,
  );
  const [demographicSurvey, setDemographicSurvey] =
    useState<UserDemographicSurveyView>(initialDemographicSurvey);
  const [isDemographicBusy, setIsDemographicBusy] = useState(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [isTtsBusy, setIsTtsBusy] = useState(false);
  const [markdownPreview, setMarkdownPreview] = useState<{
    itemId: string;
    title: string;
    content: string;
  } | null>(null);
  const [summaryPreview, setSummaryPreview] = useState<{
    itemId: string;
    title: string;
    content: string;
  } | null>(null);
  const [summaryBusyItemId, setSummaryBusyItemId] = useState<string | null>(
    null,
  );
  const [ttsRequestBusyItemId, setTtsRequestBusyItemId] = useState<
    string | null
  >(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const shareActionFeedbackTimerRef = useRef<number | null>(null);
  const recentItemsToastTimerRef = useRef<number | null>(null);
  const isSettingsView = viewMode === "settings";
  const isPodcastAppsView = viewMode === "podcast-apps";
  const showFeedSection = readOnly || isPodcastAppsView;
  const showSettingsSection = !readOnly && isSettingsView;
  const showSubmissionSection = !readOnly && viewMode === "workspace";
  const showItemsSection = viewMode === "workspace";
  const showDiagnosticsSection =
    !readOnly && isDemoAccount && viewMode === "workspace";
  const showSubmissionQuota = showSubmissionSection && Boolean(submissionQuota);
  const summaryModeEnabled = processingMode === "SUMMARY_ONLY";
  const paidSummaryBlocked =
    Boolean(submissionQuota?.isPaid) &&
    summaryModeEnabled &&
    ((submissionQuota?.dailySummaryLimit ?? 0) <= 0 ||
      (submissionQuota?.remainingDailySummaries ?? 0) <= 0);
  const paidQueueFull =
    Boolean(submissionQuota?.isPaid) &&
    !summaryModeEnabled &&
    (submissionQuota?.remainingDailyPodcasts ?? 0) <= 0 &&
    (submissionQuota?.maxDeferredPodcasts ?? 0) > 0 &&
    (submissionQuota?.queuedDeferredPodcasts ?? 0) >=
      (submissionQuota?.maxDeferredPodcasts ?? 0);
  const paidWillDefer =
    Boolean(submissionQuota?.isPaid) &&
    !summaryModeEnabled &&
    !paidQueueFull &&
    (submissionQuota?.remainingDailyPodcasts ?? 0) <= 0;
  const submissionBlocked =
    showSubmissionQuota &&
    (paidQueueFull ||
      paidSummaryBlocked ||
      (!submissionQuota?.isPaid &&
        (submissionQuota?.remainingFreeSubmissions ?? 0) <= 0));
  const submissionQuotaMessage = showSubmissionQuota
    ? submissionQuota?.isPaid
      ? summaryModeEnabled
        ? paidSummaryBlocked
          ? `Pro plan: ${submissionQuota?.dailySummaryLimit ?? 0} summary-mode items can start in the current 24-hour window.`
          : `Summary Mode: ${submissionQuota?.remainingDailySummaries ?? 0} of ${
              submissionQuota?.dailySummaryLimit ?? 0
            } item summaries can start in the current 24-hour window.`
        : paidQueueFull
          ? "The current Pro window and overflow queue are full. Try again later."
          : paidWillDefer
            ? `The current Pro window is full, but new submissions still queue automatically. ${
                submissionQuota?.queuedDeferredPodcasts ?? 0
              } of ${submissionQuota?.maxDeferredPodcasts ?? 0} overflow spots are already reserved.`
            : `Pro plan: ${submissionQuota?.remainingDailyPodcasts ?? 0} of ${
                submissionQuota?.dailyPodcastLimit ?? 0
              } episodes can start right away in the current 24-hour window.`
      : `Free trial: ${submissionQuota?.remainingFreeSubmissions ?? 0} of ${
          submissionQuota?.totalFreeSubmissionAllowance ?? 0
        } submissions remaining.`
    : null;
  const requestedSettingsSections = useMemo(
    () => new Set(settingsSections),
    [settingsSections],
  );
  const showVoiceSettingsSection =
    showSettingsSection && requestedSettingsSections.has("voice");
  const showDigestSettingsSection =
    showSettingsSection && requestedSettingsSections.has("digest");
  const showDemographicSection =
    showSettingsSection && requestedSettingsSections.has("demographics");
  const showWorkspaceHeader =
    viewMode === "workspace" && Boolean(workspaceHeading);

  const newestFirst = useMemo(() => {
    return [...items].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );
  }, [items]);
  const inProgressCount = useMemo(
    () => newestFirst.filter((item) => isPendingStatus(item.status)).length,
    [newestFirst],
  );
  const ttsVoicesForProvider = useMemo(() => {
    return ttsCatalog.voicesByProvider.kokoro || [];
  }, [ttsCatalog.voicesByProvider]);
  const selectedProviderAvailability = useMemo(
    () => ttsAvailability.kokoro,
    [ttsAvailability],
  );

  useEffect(() => {
    if (ttsVoicesForProvider.some((voice) => voice.id === ttsVoice)) {
      return;
    }

    const fallback =
      ttsCatalog.defaults.voiceByProvider.kokoro ||
      ttsVoicesForProvider[0]?.id ||
      "";
    if (fallback) {
      setTtsVoice(fallback);
    }
  }, [ttsCatalog.defaults.voiceByProvider, ttsVoice, ttsVoicesForProvider]);

  useEffect(() => {
    try {
      const storedPreference = window.localStorage.getItem(
        OPTIONAL_DETAILS_STORAGE_KEY,
      );
      if (storedPreference === "expanded") {
        setShowOptionalDetails(true);
      }
    } catch {
      // Ignore storage access issues and keep the compact default.
    } finally {
      setHasLoadedOptionalDetailsPreference(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedOptionalDetailsPreference) {
      return;
    }
    try {
      window.localStorage.setItem(
        OPTIONAL_DETAILS_STORAGE_KEY,
        showOptionalDetails ? "expanded" : "collapsed",
      );
    } catch {
      // Ignore storage access issues and keep the in-memory preference only.
    }
  }, [hasLoadedOptionalDetailsPreference, showOptionalDetails]);

  useEffect(() => {
    if (!showSubmissionSection) {
      return;
    }

    const focusTarget =
      sourceMode === "url" ? urlInputRef.current : pdfInputRef.current;
    if (!focusTarget) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      focusTarget.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [showSubmissionSection, sourceMode]);

  useEffect(() => {
    return () => {
      if (shareActionFeedbackTimerRef.current !== null) {
        window.clearTimeout(shareActionFeedbackTimerRef.current);
      }
      if (recentItemsToastTimerRef.current !== null) {
        window.clearTimeout(recentItemsToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!summaryPreview) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setSummaryPreview(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [summaryPreview]);

  const showShareActionFeedback = useCallback(
    (feedback: Exclude<ShareActionFeedback, null>) => {
      if (shareActionFeedbackTimerRef.current !== null) {
        window.clearTimeout(shareActionFeedbackTimerRef.current);
        shareActionFeedbackTimerRef.current = null;
      }

      setShareActionFeedback(feedback);
      shareActionFeedbackTimerRef.current = window.setTimeout(() => {
        setShareActionFeedback((current) =>
          current &&
          current.itemId === feedback.itemId &&
          current.kind === feedback.kind &&
          current.message === feedback.message
            ? null
            : current,
        );
        shareActionFeedbackTimerRef.current = null;
      }, INLINE_ACTION_FEEDBACK_RESET_MS);
    },
    [],
  );

  const showRecentItemsToast = useCallback(
    (toast: Exclude<RecentItemsToast, null>) => {
      if (recentItemsToastTimerRef.current !== null) {
        window.clearTimeout(recentItemsToastTimerRef.current);
        recentItemsToastTimerRef.current = null;
      }

      setRecentItemsToast(toast);
      recentItemsToastTimerRef.current = window.setTimeout(() => {
        setRecentItemsToast((current) =>
          current &&
          current.kind === toast.kind &&
          current.message === toast.message
            ? null
            : current,
        );
        recentItemsToastTimerRef.current = null;
      }, RECENT_ITEMS_TOAST_RESET_MS);
    },
    [],
  );

  const refreshItems = useCallback(async () => {
    const response = await fetch(
      `/api/seed-demo?refresh=items&t=${Date.now()}`,
      {
        cache: "no-store",
      },
    );
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as {
      items: DashboardItem[];
      extractionDiagnostics?: DemoExtractionDiagnostic[];
    };
    setItems((previous) =>
      mergeItemsPreservingEpisodeTokens(previous, payload.items),
    );
    if (isDemoAccount && Array.isArray(payload.extractionDiagnostics)) {
      setDemoDiagnostics(payload.extractionDiagnostics);
    }
  }, [isDemoAccount]);

  useEffect(() => {
    if (readOnly || !showItemsSection) {
      return;
    }

    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void refreshItems();
    };

    const intervalMs =
      inProgressCount > 0
        ? ACTIVE_REFRESH_INTERVAL_MS
        : IDLE_REFRESH_INTERVAL_MS;
    const interval = window.setInterval(() => {
      refreshIfVisible();
    }, intervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshItems();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [inProgressCount, readOnly, refreshItems, showItemsSection]);

  const optionalDetailsPanel = (
    <section className="mt-2.5 rounded-xl border border-[rgba(31,42,31,0.1)] bg-white/80 p-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[var(--ink)]">
            Optional details
          </p>
          <p className="text-xs text-[var(--muted)]">
            Title, importance, and tags are optional.
          </p>
        </div>
        <button
          type="button"
          className="rounded-full border border-[rgba(31,42,31,0.12)] bg-white px-3 py-1 text-xs font-medium text-[var(--muted)] transition hover:border-[rgba(31,42,31,0.2)] hover:text-[var(--ink)]"
          aria-controls="submission-optional-details"
          aria-expanded={showOptionalDetails}
          onClick={() => setShowOptionalDetails((current) => !current)}
        >
          {showOptionalDetails ? "Hide" : "Show"}
        </button>
      </div>

      {showOptionalDetails ? (
        <div id="submission-optional-details" className="mt-2.5 grid gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              Title
            </span>
            <input
              className="w-full rounded-lg border px-3 py-1.5 text-sm"
              placeholder="Leave blank to auto-title"
              value={titleInput}
              onChange={(event) => setTitleInput(event.target.value)}
              onKeyDown={handleActiveSourceEnter}
            />
          </label>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Importance
              </span>
              <select
                className="w-full rounded-lg border px-3 py-1.5 text-sm"
                value={importanceInput}
                onChange={(event) =>
                  setImportanceInput(event.target.value as ItemImportance)
                }
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Tags
              </span>
              <input
                className="w-full rounded-lg border px-3 py-1.5 text-sm"
                placeholder="financial, personal, retirement"
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                onKeyDown={handleActiveSourceEnter}
              />
            </label>
          </div>
        </div>
      ) : null}
    </section>
  );

  async function submitUrl() {
    if (!urlInput) return;
    setIsBusy(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/items/url", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          url: urlInput,
          title: titleInput.trim() || undefined,
          importance: importanceInput,
          mode: summaryModeEnabled ? "summary" : "full",
          tags: tagsInput,
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        setStatusMessage(json.error_message || "Failed to submit URL.");
        return;
      }

      setStatusMessage(
        json.accepted_message ||
          (json.queue_mode === "deferred"
            ? "Accepted. Processing is queued for the next available Pro window."
            : "URL received. Processing has started and status will update automatically."),
      );
      setSubmissionQuota(json.submission_quota ?? null);
      setUrlInput("");
      setTitleInput("");
      setImportanceInput("LOW");
      setTagsInput("");
      await refreshItems();
    } finally {
      setIsBusy(false);
    }
  }

  async function submitPdf() {
    if (!pdfFile) {
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      formData.set("file", pdfFile);
      if (titleInput.trim()) {
        formData.set("title", titleInput.trim());
      }
      formData.set("importance", importanceInput);
      formData.set("mode", summaryModeEnabled ? "summary" : "full");
      formData.set("tags", tagsInput);

      const response = await fetch("/api/items/pdf", {
        method: "POST",
        body: formData,
      });

      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(json.error_message || "Failed to upload PDF.");
        return;
      }

      setStatusMessage(
        json.accepted_message ||
          (json.queue_mode === "deferred"
            ? "Accepted. Processing is queued for the next available Pro window."
            : "PDF uploaded. Processing has started and status will update automatically."),
      );
      setSubmissionQuota(json.submission_quota ?? null);
      setPdfFile(null);
      setTitleInput("");
      setImportanceInput("LOW");
      setTagsInput("");
      if (pdfInputRef.current) {
        pdfInputRef.current.value = "";
      }
      await refreshItems();
    } finally {
      setIsBusy(false);
    }
  }

  async function replaceFeedUrl() {
    const confirmed = window.confirm(
      "Replace your private feed URL?\n\nThe old URL will stop working immediately, and you will need to add the new URL in every podcast app where you subscribed.",
    );
    if (!confirmed) {
      return;
    }

    setIsFeedUrlBusy(true);
    setFeedUrlStatusMessage(null);
    try {
      const response = await fetch("/api/feed-token/rotate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "manual rotation" }),
      });
      const json = await response.json();
      if (!response.ok) {
        setFeedUrlStatusMessage(
          json.error_message || "Could not replace the private feed URL.",
        );
        return;
      }

      setFeedUrlStatusMessage("Private feed URL replaced. Reloading...");
      window.location.reload();
    } finally {
      setIsFeedUrlBusy(false);
    }
  }

  async function copyEpisodeShareLink(item: DashboardItem) {
    setStatusMessage(null);
    if (item.share?.shareUrl) {
      const copied = await copyText(item.share.shareUrl);
      showShareActionFeedback(
        copied
          ? {
              itemId: item.id,
              kind: "copied",
              message: "Share link copied.",
            }
          : {
              itemId: item.id,
              kind: "error",
              message:
                "Could not copy automatically. Try Copy share link again.",
            },
      );
      return;
    }

    setShareBusyState({ itemId: item.id, action: "create" });
    try {
      const response = await fetch(`/api/share/episode/${item.id}`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok) {
        showShareActionFeedback({
          itemId: item.id,
          kind: "error",
          message: json.error_message || "Failed to create episode share link.",
        });
        return;
      }

      setItems((previous) =>
        previous.map((current) =>
          current.id === item.id
            ? {
                ...current,
                share: {
                  shareId: json.share_id,
                  shareUrl: json.share_url,
                },
              }
            : current,
        ),
      );
      const copied = await copyText(json.share_url);
      showShareActionFeedback(
        copied
          ? {
              itemId: item.id,
              kind: "copied",
              message: "Share link copied.",
            }
          : {
              itemId: item.id,
              kind: "error",
              message:
                "Share link created. Tap Copy share link again if you still need it.",
            },
      );
    } finally {
      setShareBusyState(null);
    }
  }

  async function revokeEpisodeShareLink(itemId: string) {
    setStatusMessage(null);
    setShareBusyState({ itemId, action: "revoke" });
    try {
      const response = await fetch(`/api/share/episode/${itemId}`, {
        method: "DELETE",
      });
      const json = await response.json();
      if (!response.ok) {
        showShareActionFeedback({
          itemId,
          kind: "error",
          message: json.error_message || "Failed to revoke episode share link.",
        });
        return;
      }

      setItems((previous) =>
        previous.map((current) =>
          current.id === itemId ? { ...current, share: null } : current,
        ),
      );
      showShareActionFeedback({
        itemId,
        kind: "revoked",
        message: "Share link revoked.",
      });
    } finally {
      setShareBusyState(null);
    }
  }

  async function retryItem(id: string) {
    await fetch(`/api/items/${id}/retry`, { method: "POST" });
    await refreshItems();
  }

  async function saveProcessingMode(nextMode: "FULL_EPISODE" | "SUMMARY_ONLY") {
    const previousMode = processingMode;
    setProcessingMode(nextMode);
    setIsProcessingModeBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/account/processing-mode", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ mode: nextMode }),
      });
      const json = await response.json();
      if (!response.ok) {
        setProcessingMode(previousMode);
        setStatusMessage(
          json.error_message || "Could not save processing mode.",
        );
        return;
      }
      setProcessingMode(
        json.mode === "SUMMARY_ONLY" ? "SUMMARY_ONLY" : "FULL_EPISODE",
      );
      setStatusMessage(
        json.mode === "SUMMARY_ONLY"
          ? "New items will save as summaries only."
          : "Every new item will be a podcast.",
      );
    } finally {
      setIsProcessingModeBusy(false);
    }
  }

  async function viewSummary(item: DashboardItem) {
    setStatusMessage(null);
    setSummaryBusyItemId(item.id);
    try {
      const response = await fetch(`/api/items/${item.id}/summary`);
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(json.error_message || "Summary is not available yet.");
        return;
      }
      setSummaryPreview({
        itemId: item.id,
        title: json.title || item.summaryTitle || item.title || "Untitled item",
        content: json.markdown || "",
      });
    } finally {
      setSummaryBusyItemId((current) => (current === item.id ? null : current));
    }
  }

  async function requestTts(item: DashboardItem) {
    setStatusMessage(null);
    setTtsRequestBusyItemId(item.id);
    try {
      const response = await fetch(`/api/items/${item.id}/request-tts`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(
          json.error_message || "Could not request TTS for this item.",
        );
        return;
      }
      setSubmissionQuota(json.submission_quota ?? submissionQuota);
      setStatusMessage(
        json.already_ready
          ? "TTS is already ready for this item."
          : json.already_queued
            ? "TTS is already queued for this item."
            : json.accepted_message ||
              "TTS requested. Audio will appear when processing completes.",
      );
      await refreshItems();
    } finally {
      setTtsRequestBusyItemId((current) =>
        current === item.id ? null : current,
      );
    }
  }

  async function deleteItem(item: DashboardItem) {
    setDeleteBusyItemId(item.id);
    try {
      const response = await fetch(`/api/items/${item.id}`, {
        method: "DELETE",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        showRecentItemsToast({
          kind: "error",
          message: json?.error_message || "Could not delete item.",
        });
        return;
      }

      setItems((previous) =>
        previous.filter((current) => current.id !== item.id),
      );
      setMarkdownPreview((current) =>
        current?.itemId === item.id ? null : current,
      );
      void refreshItems();
      showRecentItemsToast({
        kind: "success",
        message: item.title ? `Deleted "${item.title}".` : "Item deleted.",
      });
    } finally {
      setDeleteBusyItemId((current) => (current === item.id ? null : current));
    }
  }

  async function viewMarkdown(itemId: string, title: string | null) {
    setStatusMessage(null);
    const response = await fetch(`/api/items/${itemId}/markdown`);
    const json = await response.json();
    if (!response.ok) {
      setStatusMessage(json.error_message || "Markdown is not available yet.");
      return;
    }
    setMarkdownPreview({
      itemId,
      title: title || "Untitled item",
      content: json.markdown || "",
    });
  }

  async function submitActiveSource() {
    if (sourceMode === "url") {
      await submitUrl();
      return;
    }

    await submitPdf();
  }

  function handleActiveSourceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      submissionBlocked ||
      isBusy ||
      (sourceMode === "url" ? !urlInput.trim() : !pdfFile)
    ) {
      return;
    }
    void submitActiveSource();
  }

  function handleActiveSourceEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (
      submissionBlocked ||
      isBusy ||
      (sourceMode === "url" ? !urlInput.trim() : !pdfFile)
    ) {
      return;
    }
    void submitActiveSource();
  }

  async function saveDigestSettings() {
    setIsDigestBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/digest/settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(digestSettings),
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(
          json.error_message || "Could not save digest settings.",
        );
        return;
      }
      setDigestSettings(json.settings as DigestSettings);
      setStatusMessage("Digest settings saved.");
    } finally {
      setIsDigestBusy(false);
    }
  }

  function handleDigestSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDigestBusy) {
      return;
    }
    void saveDigestSettings();
  }

  function handleDigestSettingsEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (isDigestBusy) {
      return;
    }
    void saveDigestSettings();
  }

  async function saveTtsSettings() {
    setIsTtsBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/tts/settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          voice: ttsVoice,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(json.error_message || "Could not save TTS settings.");
        return;
      }
      setStatusMessage(`Default voice saved (${json.selection.voice}).`);
    } finally {
      setIsTtsBusy(false);
    }
  }

  async function saveDemographicSurvey() {
    if (!demographicSurvey.ageBand || !demographicSurvey.genderIdentity) {
      setStatusMessage(
        "Select age band and gender identity before saving, or choose Skip for now.",
      );
      return;
    }
    if (
      demographicSurvey.genderIdentity === "SELF_DESCRIBE" &&
      !demographicSurvey.genderSelfDescribe?.trim()
    ) {
      setStatusMessage(
        "Add a self-description or choose a different gender identity option.",
      );
      return;
    }

    setIsDemographicBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/account/demographics", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "save",
          ageBand: demographicSurvey.ageBand,
          genderIdentity: demographicSurvey.genderIdentity,
          genderSelfDescribe:
            demographicSurvey.genderIdentity === "SELF_DESCRIBE"
              ? demographicSurvey.genderSelfDescribe
              : null,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(
          json.error_message || "Could not save demographic profile.",
        );
        return;
      }
      setDemographicSurvey(json.survey as UserDemographicSurveyView);
      setStatusMessage("Demographic profile saved.");
    } finally {
      setIsDemographicBusy(false);
    }
  }

  function handleDemographicSurveySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDemographicBusy) {
      return;
    }
    void saveDemographicSurvey();
  }

  function handleDemographicSurveyEnter(
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (isDemographicBusy) {
      return;
    }
    void saveDemographicSurvey();
  }

  async function skipDemographicSurvey() {
    setIsDemographicBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/account/demographics", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "skip",
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(
          json.error_message || "Could not skip demographic profile.",
        );
        return;
      }
      setDemographicSurvey(json.survey as UserDemographicSurveyView);
      setStatusMessage(
        "Demographic profile skipped. You can update this anytime.",
      );
    } finally {
      setIsDemographicBusy(false);
    }
  }

  async function deleteDemographicSurvey() {
    setIsDemographicBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/account/demographics", {
        method: "DELETE",
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(
          json.error_message || "Could not delete demographic profile.",
        );
        return;
      }
      setDemographicSurvey(json.survey as UserDemographicSurveyView);
      setStatusMessage("Demographic responses deleted.");
    } finally {
      setIsDemographicBusy(false);
    }
  }

  async function previewVoice() {
    setIsTtsBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/tts/preview", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          voice: ttsVoice,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(
          json.error_message || "Could not generate preview audio.",
        );
        return;
      }
      setPreviewAudioUrl(json.preview.dataUrl);
      setStatusMessage(`Preview generated (${json.preview.voice}).`);
    } finally {
      setIsTtsBusy(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {showWorkspaceHeader ? (
        <section className="card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-0.5">
              <h1 className="break-words text-xl font-bold sm:text-2xl">
                {workspaceHeading}
              </h1>
              {workspaceSubheading ? (
                <p className="text-sm text-[var(--muted)]">
                  {workspaceSubheading}
                </p>
              ) : null}
            </div>
            {!readOnly ? (
              <div className="w-full max-w-md lg:w-[27rem]">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  New item mode
                </p>
                <div
                  aria-label="New item processing mode"
                  className="relative grid grid-cols-2 rounded-full border border-[rgba(31,122,90,0.2)] bg-[rgba(247,251,250,0.95)] p-1 shadow-inner"
                  role="group"
                >
                  <span
                    aria-hidden="true"
                    className="absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-full bg-[var(--accent)] shadow-sm transition-transform duration-200 ease-out"
                    style={{
                      transform: summaryModeEnabled
                        ? "translateX(calc(100% + 0.5rem))"
                        : "translateX(0)",
                    }}
                  />
                  <button
                    aria-pressed={!summaryModeEnabled}
                    className={`relative z-10 flex min-h-[3rem] items-center justify-center rounded-full px-2.5 py-1.5 text-center text-[11px] font-semibold leading-tight transition sm:text-xs ${
                      !summaryModeEnabled
                        ? "text-white"
                        : "text-[var(--ink)] hover:text-[var(--accent)]"
                    }`}
                    disabled={isProcessingModeBusy}
                    onClick={() => {
                      if (processingMode !== "FULL_EPISODE") {
                        void saveProcessingMode("FULL_EPISODE");
                      }
                    }}
                    type="button"
                  >
                    Every new item is a podcast
                  </button>
                  <button
                    aria-pressed={summaryModeEnabled}
                    className={`relative z-10 flex min-h-[3rem] flex-col items-center justify-center rounded-full px-2.5 py-1.5 text-center text-[11px] font-semibold leading-tight transition sm:text-xs ${
                      summaryModeEnabled
                        ? "text-white"
                        : "text-[var(--ink)] hover:text-[var(--accent)]"
                    }`}
                    disabled={isProcessingModeBusy}
                    onClick={() => {
                      if (processingMode !== "SUMMARY_ONLY") {
                        void saveProcessingMode("SUMMARY_ONLY");
                      }
                    }}
                    type="button"
                  >
                    <span>Summaries only</span>
                    <span
                      className={`text-[10px] font-medium sm:text-[11px] ${summaryModeEnabled ? "text-white/85" : "text-[var(--muted)]"}`}
                    >
                      Daily and weekly podcasts
                    </span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {showFeedSection ? (
        <section
          className="card scroll-mt-24 p-4 sm:p-5"
          id={isPodcastAppsView ? "podcast-apps" : undefined}
        >
          <h2 className="text-lg font-semibold">Set up your private feed</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Copy your private feed URL first, then open your podcast app. If the
            app&apos;s next step is unclear, use the walkthroughs below for the
            exact labels and screens.
          </p>
          <div className="space-y-3">
            <FeedUrlActions
              allowFeedReplacement={!readOnly}
              autoFocusPrimaryAction={isPodcastAppsView}
              feedManagementStatusMessage={feedUrlStatusMessage}
              feedUrl={feedUrl}
              isReplacingFeedUrl={isFeedUrlBusy}
              onReplaceFeedUrl={() => {
                void replaceFeedUrl();
              }}
              unavailableMessage={feedUrlMessage}
            />
          </div>
        </section>
      ) : null}

      {showVoiceSettingsSection ? (
        <section className="card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Voice Settings</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Choose your default Kokoro voice for new episodes.
          </p>

          <div className="mt-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Voice</span>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={ttsVoice}
                disabled={isTtsBusy || ttsVoicesForProvider.length === 0}
                onChange={(event) => {
                  setTtsVoice(event.target.value);
                  setPreviewAudioUrl(null);
                }}
              >
                {ttsVoicesForProvider.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label}
                    {voice.gender ? ` (${voice.gender})` : ""}
                    {voice.locale ? ` - ${voice.locale}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedProviderAvailability &&
          !selectedProviderAvailability.available ? (
            <p className="mt-2 text-xs text-[var(--danger)]">
              {selectedProviderAvailability.reason ||
                "Selected provider is unavailable in this environment."}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-[var(--muted)]">
            Preview uses a fixed sample clip generated at startup and cached on
            disk.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <button
              className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto"
              disabled={isTtsBusy}
              onClick={previewVoice}
            >
              Preview Voice
            </button>
            <button
              className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
              disabled={isTtsBusy || !ttsVoice}
              onClick={saveTtsSettings}
            >
              Save Default
            </button>
          </div>

          {previewAudioUrl ? (
            <div className="mt-3">
              <audio
                controls
                className="w-full"
                preload="metadata"
                src={previewAudioUrl}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {showDigestSettingsSection ? (
        <CollapsibleSettingsCard
          title="Digest Settings"
          description="Open this only when you want to adjust daily or weekly summary delivery."
        >
          <form onSubmit={handleDigestSettingsSubmit}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Timezone (IANA)
                </span>
                <input
                  className="w-full rounded-lg border px-3 py-2"
                  value={digestSettings.timezone}
                  onChange={(event) =>
                    setDigestSettings((current) => ({
                      ...current,
                      timezone: event.target.value.trim(),
                    }))
                  }
                  onKeyDown={handleDigestSettingsEnter}
                />
              </label>
            </div>

            <div className="mt-4 rounded-lg border p-3">
              <h3 className="text-sm font-semibold">Daily digest</h3>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={digestSettings.dailyEmailEnabled}
                    onChange={(event) =>
                      setDigestSettings((current) => ({
                        ...current,
                        dailyEmailEnabled: event.target.checked,
                      }))
                    }
                  />
                  Daily email
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={digestSettings.dailyPodcastEnabled}
                    onChange={(event) =>
                      setDigestSettings((current) => ({
                        ...current,
                        dailyPodcastEnabled: event.target.checked,
                      }))
                    }
                  />
                  Daily podcast
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block">Hour</span>
                  <input
                    className="w-full rounded-lg border px-3 py-2"
                    type="number"
                    min={0}
                    max={23}
                    value={digestSettings.dailyHour}
                    onChange={(event) =>
                      setDigestSettings((current) => ({
                        ...current,
                        dailyHour:
                          Number.parseInt(event.target.value || "0", 10) || 0,
                      }))
                    }
                    onKeyDown={handleDigestSettingsEnter}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block">Minute</span>
                  <input
                    className="w-full rounded-lg border px-3 py-2"
                    type="number"
                    min={0}
                    max={59}
                    value={digestSettings.dailyMinute}
                    onChange={(event) =>
                      setDigestSettings((current) => ({
                        ...current,
                        dailyMinute:
                          Number.parseInt(event.target.value || "0", 10) || 0,
                      }))
                    }
                    onKeyDown={handleDigestSettingsEnter}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block">Podcast length</span>
                  <select
                    className="w-full rounded-lg border px-3 py-2"
                    value={digestSettings.dailyLengthMinutes}
                    onChange={(event) =>
                      setDigestSettings((current) => ({
                        ...current,
                        dailyLengthMinutes: Number.parseInt(
                          event.target.value,
                          10,
                        ) as 5 | 15 | 30,
                      }))
                    }
                  >
                    {LENGTH_OPTIONS.map((value) => (
                      <option key={`daily-${value}`} value={value}>
                        {value} minutes
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-4 rounded-lg border p-3">
              <h3 className="text-sm font-semibold">Weekly digest</h3>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={digestSettings.weeklyEmailEnabled}
                    onChange={(event) =>
                      setDigestSettings((current) => ({
                        ...current,
                        weeklyEmailEnabled: event.target.checked,
                      }))
                    }
                  />
                  Weekly email
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={digestSettings.weeklyPodcastEnabled}
                    onChange={(event) =>
                      setDigestSettings((current) => ({
                        ...current,
                        weeklyPodcastEnabled: event.target.checked,
                      }))
                    }
                  />
                  Weekly podcast
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block">Day</span>
                  <select
                    className="w-full rounded-lg border px-3 py-2"
                    value={digestSettings.weeklyDayOfWeek}
                    onChange={(event) =>
                      setDigestSettings((current) => ({
                        ...current,
                        weeklyDayOfWeek:
                          Number.parseInt(event.target.value, 10) || 0,
                      }))
                    }
                  >
                    {WEEKDAY_OPTIONS.map((option) => (
                      <option
                        key={`weekly-day-${option.value}`}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block">Hour</span>
                  <input
                    className="w-full rounded-lg border px-3 py-2"
                    type="number"
                    min={0}
                    max={23}
                    value={digestSettings.weeklyHour}
                    onChange={(event) =>
                      setDigestSettings((current) => ({
                        ...current,
                        weeklyHour:
                          Number.parseInt(event.target.value || "0", 10) || 0,
                      }))
                    }
                    onKeyDown={handleDigestSettingsEnter}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block">Minute</span>
                  <input
                    className="w-full rounded-lg border px-3 py-2"
                    type="number"
                    min={0}
                    max={59}
                    value={digestSettings.weeklyMinute}
                    onChange={(event) =>
                      setDigestSettings((current) => ({
                        ...current,
                        weeklyMinute:
                          Number.parseInt(event.target.value || "0", 10) || 0,
                      }))
                    }
                    onKeyDown={handleDigestSettingsEnter}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block">Podcast length</span>
                  <select
                    className="w-full rounded-lg border px-3 py-2"
                    value={digestSettings.weeklyLengthMinutes}
                    onChange={(event) =>
                      setDigestSettings((current) => ({
                        ...current,
                        weeklyLengthMinutes: Number.parseInt(
                          event.target.value,
                          10,
                        ) as 5 | 15 | 30,
                      }))
                    }
                  >
                    {LENGTH_OPTIONS.map((value) => (
                      <option key={`weekly-${value}`} value={value}>
                        {value} minutes
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-3">
              <button
                className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
                disabled={isDigestBusy}
                type="submit"
              >
                Save digest settings
              </button>
            </div>
          </form>
        </CollapsibleSettingsCard>
      ) : null}

      {showDemographicSection ? (
        <CollapsibleSettingsCard
          title="Optional Demographic Profile"
          description="This is optional and used only for aggregate product insights. You can skip it, edit it later, or delete it anytime."
        >
          <form onSubmit={handleDemographicSurveySubmit}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Age band</span>
                <select
                  className="w-full rounded-lg border px-3 py-2"
                  value={demographicSurvey.ageBand ?? ""}
                  onChange={(event) =>
                    setDemographicSurvey((current) => ({
                      ...current,
                      ageBand: (event.target.value ||
                        null) as DemographicAgeBand | null,
                    }))
                  }
                >
                  <option value="">Select age band (optional)</option>
                  {DEMOGRAPHIC_AGE_BANDS.map((ageBand) => (
                    <option key={ageBand} value={ageBand}>
                      {ageBandLabel(ageBand)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Gender identity
                </span>
                <select
                  className="w-full rounded-lg border px-3 py-2"
                  value={demographicSurvey.genderIdentity ?? ""}
                  onChange={(event) =>
                    setDemographicSurvey((current) => ({
                      ...current,
                      genderIdentity: (event.target.value ||
                        null) as DemographicGenderIdentity | null,
                      genderSelfDescribe:
                        event.target.value === "SELF_DESCRIBE"
                          ? current.genderSelfDescribe
                          : null,
                    }))
                  }
                >
                  <option value="">Select gender identity (optional)</option>
                  {DEMOGRAPHIC_GENDER_IDENTITIES.map((identity) => (
                    <option key={identity} value={identity}>
                      {genderIdentityLabel(identity)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {demographicSurvey.genderIdentity === "SELF_DESCRIBE" ? (
              <label className="mt-3 block">
                <span className="mb-1 block text-sm font-medium">
                  Self-describe
                </span>
                <input
                  className="w-full rounded-lg border px-3 py-2"
                  maxLength={120}
                  value={demographicSurvey.genderSelfDescribe ?? ""}
                  onChange={(event) =>
                    setDemographicSurvey((current) => ({
                      ...current,
                      genderSelfDescribe: event.target.value,
                    }))
                  }
                  onKeyDown={handleDemographicSurveyEnter}
                />
              </label>
            ) : null}

            <p className="mt-3 text-xs text-[var(--muted)]">
              Current status: {demographicSurvey.status.toLowerCase()}
              {demographicSurvey.updatedAt
                ? ` · Updated ${new Date(demographicSurvey.updatedAt).toLocaleString()}`
                : ""}
            </p>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button
                className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
                disabled={isDemographicBusy}
                type="submit"
              >
                Save demographic profile
              </button>
              <button
                className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto"
                disabled={isDemographicBusy}
                onClick={skipDemographicSurvey}
                type="button"
              >
                Skip for now
              </button>
              <button
                className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto"
                disabled={isDemographicBusy}
                onClick={deleteDemographicSurvey}
                type="button"
              >
                Delete responses
              </button>
            </div>
          </form>
        </CollapsibleSettingsCard>
      ) : null}

      {showSubmissionSection ? (
        <section className="card p-4">
          <h2 className="text-lg font-semibold">Add New Episode</h2>
          <form
            className="mt-2.5 rounded-2xl bg-[var(--accent-soft)]/35 p-3"
            onSubmit={handleActiveSourceSubmit}
          >
            <fieldset>
              <legend className="sr-only">Choose source</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label
                  className={`cursor-pointer rounded-xl border px-3 py-2.5 text-sm transition ${
                    sourceMode === "url"
                      ? "border-[var(--accent)] bg-white text-[var(--ink)] shadow-sm"
                      : "border-[rgba(31,42,31,0.12)] bg-white/70 text-[var(--ink)]"
                  }`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="source-mode"
                    value="url"
                    checked={sourceMode === "url"}
                    onChange={() => setSourceMode("url")}
                    disabled={isBusy}
                  />
                  <span className="block font-semibold">Paste article URL</span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    Best for web articles and blog posts.
                  </span>
                </label>
                <label
                  className={`cursor-pointer rounded-xl border px-3 py-2.5 text-sm transition ${
                    sourceMode === "pdf"
                      ? "border-[var(--accent)] bg-white text-[var(--ink)] shadow-sm"
                      : "border-[rgba(31,42,31,0.12)] bg-white/70 text-[var(--ink)]"
                  }`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="source-mode"
                    value="pdf"
                    checked={sourceMode === "pdf"}
                    onChange={() => setSourceMode("pdf")}
                    disabled={isBusy}
                  />
                  <span className="block font-semibold">Upload PDF</span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    Best for saved documents and reports.
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="mt-2.5 space-y-2.5">
              {sourceMode === "url" ? (
                <article className="rounded-2xl border border-[rgba(31,122,90,0.34)] bg-[rgba(223,243,236,0.82)] p-3 shadow-[0_0_0_1px_rgba(31,122,90,0.06)] transition focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_4px_rgba(31,122,90,0.16)]">
                  <label className="block">
                    <span className="mb-0.5 block text-sm font-semibold text-[var(--accent)]">
                      Article URL
                    </span>
                    <input
                      className="w-full rounded-lg border border-[rgba(31,122,90,0.32)] bg-white/96 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] transition placeholder:text-slate-400 focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(31,122,90,0.12)] focus:outline-none"
                      placeholder="https://example.com/article"
                      ref={urlInputRef}
                      value={urlInput}
                      onChange={(event) => setUrlInput(event.target.value)}
                      onKeyDown={handleActiveSourceEnter}
                    />
                  </label>
                  {optionalDetailsPanel}
                </article>
              ) : (
                <article className="rounded-2xl border border-[rgba(31,122,90,0.34)] bg-[rgba(223,243,236,0.82)] p-3 shadow-[0_0_0_1px_rgba(31,122,90,0.06)] transition focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_4px_rgba(31,122,90,0.16)]">
                  <label className="mb-0.5 block text-sm font-semibold text-[var(--accent)]">
                    PDF file
                  </label>
                  <input
                    ref={pdfInputRef}
                    className="block w-full rounded-lg border border-[rgba(31,122,90,0.32)] bg-white/96 px-3 py-1.5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] transition file:mr-3 file:rounded-md file:border-0 file:bg-[var(--accent-soft)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[var(--accent)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(31,122,90,0.12)] focus:outline-none"
                    type="file"
                    accept="application/pdf"
                    onChange={(event) => {
                      setPdfFile(event.target.files?.[0] ?? null);
                    }}
                  />
                  {pdfFile ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Selected file: {pdfFile.name}
                    </p>
                  ) : null}
                  {optionalDetailsPanel}
                </article>
              )}

              <button
                className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60 sm:w-auto"
                disabled={
                  submissionBlocked ||
                  isBusy ||
                  (sourceMode === "url" ? !urlInput.trim() : !pdfFile)
                }
                type="submit"
              >
                {sourceMode === "url" ? "Submit URL" : "Upload PDF"}
              </button>

              {submissionQuotaMessage ? (
                submissionBlocked || paidWillDefer ? (
                  <div
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      submissionBlocked
                        ? "border-[#f9c6c3] bg-[#fff1f0] text-[#8d231f]"
                        : "border-[#fce8b2] bg-[#fff6d9] text-[#6f5200]"
                    }`}
                  >
                    <p>{submissionQuotaMessage}</p>
                    {!submissionQuota?.isPaid && submissionBlocked ? (
                      <p className="mt-1">
                        Trial quota is exhausted. Upgrade on the{" "}
                        <Link className="underline" href="/pricing">
                          pricing page
                        </Link>{" "}
                        or ask an admin for extra tries.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--muted)]">
                    {submissionQuotaMessage}
                  </p>
                )
              ) : null}
            </div>
          </form>
        </section>
      ) : null}

      {statusMessage ? (
        <p className="text-sm text-[var(--muted)]">{statusMessage}</p>
      ) : null}
      {showItemsSection && inProgressCount > 0 ? (
        <p className="rounded-lg border border-[#fce8b2] bg-[#fff6d9] px-3 py-2 text-sm text-[#6f5200]">
          Processing in progress for {inProgressCount} item
          {inProgressCount === 1 ? "" : "s"}. This list refreshes automatically.
        </p>
      ) : null}

      {showItemsSection ? (
        <section className="card p-4 sm:p-5">
          <div className="mb-4">
            <div>
              <h2 className="text-lg font-semibold">Recent items</h2>
              <p className="text-sm text-[var(--muted)]">
                Track processing, play finished audio, and clean up older saves
                from one list.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {newestFirst.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No items yet. Submit a URL or upload a PDF.
              </p>
            ) : null}

            {newestFirst.map((item) => {
              const badgeClass = item.status.toLowerCase();
              const statusText = item.status.toUpperCase();
              const displayErrorMessage = normalizeItemErrorMessage(
                item.errorMessage,
              );
              const mediaUrl = item.episode
                ? `/api/media/${item.episode.audioPath}?mt=${encodeURIComponent(item.episode.mediaToken)}&eid=${encodeURIComponent(item.episode.id)}`
                : null;
              const helpText = itemStatusHelpText(item);
              const showRetry =
                statusText === "FAILED" &&
                !recommendsChromeExtensionCapture(item.errorMessage);
              const hasSummary = item.summaryStatus === "SUCCEEDED";
              const isSummaryItem = item.processingMode === "SUMMARY_ONLY";
              const hasMarkdown = item.markdownBytes !== null;
              const canRequestTts =
                !readOnly &&
                isSummaryItem &&
                hasSummary &&
                !item.episode &&
                !isPendingStatus(item.status);
              const isViewingSummary = summaryBusyItemId === item.id;
              const isRequestingTts = ttsRequestBusyItemId === item.id;
              const shareFeedback =
                shareActionFeedback?.itemId === item.id
                  ? shareActionFeedback
                  : null;
              const isShareBusy = shareBusyState?.itemId === item.id;
              const isCreatingShare =
                isShareBusy && shareBusyState?.action === "create";
              const isRevokingShare =
                isShareBusy && shareBusyState?.action === "revoke";
              const shareCopied = shareFeedback?.kind === "copied";
              const shareFeedbackClassName =
                shareFeedback?.kind === "error"
                  ? "text-[var(--danger)]"
                  : "text-emerald-700";
              const itemActionClassName =
                "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs text-[var(--ink)] transition hover:border-slate-300 hover:bg-white";
              const hasActionRow =
                Boolean(mediaUrl) || hasSummary || hasMarkdown || !readOnly;
              const isDeletingItem = deleteBusyItemId === item.id;

              return (
                <article key={item.id} className="rounded-xl border p-3 sm:p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`badge ${badgeClass}`}>
                      {item.status.toLowerCase()}
                    </span>
                    <span className="rounded-full border border-[rgba(31,42,31,0.12)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                      {isSummaryItem ? "summary" : "episode"}
                    </span>
                    {item.summaryStatus !== "NOT_REQUESTED" ? (
                      <span
                        className={`badge ${item.summaryStatus === "SUCCEEDED" ? "ready" : item.summaryStatus.toLowerCase()}`}
                      >
                        {summaryStatusLabel(item.summaryStatus)}
                      </span>
                    ) : null}
                    <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      {sourceTypeBadgeLabel(item.sourceType)}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <h3 className="break-words font-semibold">
                    {item.title || "Untitled item"}
                  </h3>
                  <p className="mt-1 break-words text-xs text-[var(--muted)]">
                    {item.sourceType === "URL" ||
                    item.sourceType === "HTML_SNAPSHOT" ? (
                      item.sourceUrl ? (
                        <>
                          Source:{" "}
                          {item.sourceType === "HTML_SNAPSHOT"
                            ? "Captured via Chrome extension from "
                            : ""}
                          <a
                            className="break-all underline"
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {item.sourceUrl}
                          </a>
                        </>
                      ) : (
                        `Source: ${sourceFallbackLabel(item.sourceType)}`
                      )
                    ) : (
                      "Source: Uploaded PDF"
                    )}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-[var(--accent)]">
                      Importance: {importanceLabel(item.importance)}
                    </span>
                    {item.tags.map((tag) => (
                      <span
                        key={`${item.id}-${tag}`}
                        className="rounded-full border border-[rgba(31,42,31,0.15)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  {helpText ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {helpText}
                    </p>
                  ) : null}
                  {displayErrorMessage && statusText === "FAILED" ? (
                    <p className="mt-1 text-sm text-[var(--danger)]">
                      {displayErrorMessage}
                    </p>
                  ) : null}

                  {mediaUrl ? (
                    <div className="mt-3">
                      <audio
                        controls
                        className="w-full"
                        preload="metadata"
                        src={mediaUrl}
                      />
                    </div>
                  ) : null}

                  {hasActionRow ? (
                    <div className="mt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {mediaUrl ? (
                          <a
                            className={itemActionClassName}
                            download
                            href={mediaUrl}
                          >
                            Download
                          </a>
                        ) : null}
                        {hasSummary ? (
                          <button
                            className={itemActionClassName}
                            disabled={isViewingSummary}
                            onClick={() => viewSummary(item)}
                          >
                            {isViewingSummary
                              ? "Opening summary..."
                              : "View summary"}
                          </button>
                        ) : null}
                        {hasMarkdown ? (
                          <a
                            className={itemActionClassName}
                            download
                            href={`/api/items/${item.id}/markdown?download=1`}
                          >
                            Download markdown
                          </a>
                        ) : null}
                        {canRequestTts ? (
                          <button
                            className={itemActionClassName}
                            disabled={isRequestingTts}
                            onClick={() => requestTts(item)}
                          >
                            {isRequestingTts
                              ? "Requesting TTS..."
                              : "Request TTS"}
                          </button>
                        ) : null}
                        {!readOnly && isAdmin ? (
                          <button
                            className={itemActionClassName}
                            onClick={() => viewMarkdown(item.id, item.title)}
                          >
                            View markdown
                          </button>
                        ) : null}
                        {!readOnly && showRetry ? (
                          <button
                            className={itemActionClassName}
                            onClick={() => retryItem(item.id)}
                          >
                            Retry
                          </button>
                        ) : null}
                        {!readOnly && item.episode ? (
                          <button
                            className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition ${
                              shareCopied
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "text-[var(--ink)] hover:border-slate-300 hover:bg-white"
                            }`}
                            disabled={isShareBusy}
                            onClick={() => copyEpisodeShareLink(item)}
                          >
                            {shareCopied ? (
                              <>
                                <svg
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    d="M5 12.5 9.5 17 19 7.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                Copied
                              </>
                            ) : isCreatingShare ? (
                              "Creating share link..."
                            ) : item.share ? (
                              "Copy share link"
                            ) : (
                              "Share episode"
                            )}
                          </button>
                        ) : null}
                        {!readOnly && item.share ? (
                          <button
                            className={itemActionClassName}
                            disabled={isShareBusy}
                            onClick={() => revokeEpisodeShareLink(item.id)}
                          >
                            {isRevokingShare
                              ? "Revoking..."
                              : "Revoke share link"}
                          </button>
                        ) : null}
                        {!readOnly ? (
                          <button
                            className={itemActionClassName}
                            disabled={isDeletingItem}
                            onClick={() => deleteItem(item)}
                          >
                            {isDeletingItem ? "Deleting..." : "Delete"}
                          </button>
                        ) : null}
                      </div>
                      {shareFeedback ? (
                        <p
                          aria-live="polite"
                          className={`mt-2 flex items-center gap-1.5 text-xs ${shareFeedbackClassName}`}
                        >
                          {shareFeedback.kind === "error" ? (
                            <svg
                              aria-hidden="true"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              viewBox="0 0 24 24"
                            >
                              <path
                                d="M12 8v5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M12 16h.01"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            <svg
                              aria-hidden="true"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                            >
                              <path
                                d="M5 12.5 9.5 17 19 7.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                          <span>{shareFeedback.message}</span>
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {summaryPreview ? (
        <div
          className="fixed inset-0 z-40 bg-[rgba(15,23,42,0.28)]"
          role="dialog"
          aria-modal="true"
          aria-label="Item summary"
        >
          <div className="flex min-h-full justify-end">
            <section className="flex h-screen w-full flex-col bg-white shadow-2xl sm:max-w-xl">
              <header className="border-b px-4 py-3 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                      Summary
                    </p>
                    <h2 className="mt-0.5 break-words text-base font-semibold">
                      {summaryPreview.title}
                    </h2>
                  </div>
                  <button
                    className="rounded-lg border px-3 py-1.5 text-xs"
                    onClick={() => setSummaryPreview(null)}
                    type="button"
                  >
                    Close
                  </button>
                </div>
              </header>
              <article className="prose prose-sm max-w-none flex-1 overflow-auto px-4 py-4 prose-a:text-[rgba(31,122,90,1)] prose-headings:text-[var(--ink)] prose-p:text-[var(--ink)] prose-ul:my-3 prose-ol:my-3 prose-li:my-1 sm:px-5">
                <ReactMarkdown
                  rehypePlugins={[rehypeSanitize]}
                  remarkPlugins={[remarkGfm]}
                >
                  {summaryPreview.content || "Summary is empty."}
                </ReactMarkdown>
              </article>
            </section>
          </div>
        </div>
      ) : null}

      {recentItemsToast ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 max-w-xs sm:bottom-6 sm:right-6 sm:max-w-sm">
          <div
            aria-live="polite"
            role="status"
            className={`rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${
              recentItemsToast.kind === "error"
                ? "border-red-200 bg-white/95 text-[var(--danger)]"
                : "border-emerald-200 bg-white/95 text-emerald-700"
            }`}
          >
            <div className="flex items-start gap-2">
              <svg
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={recentItemsToast.kind === "error" ? "1.8" : "2"}
                viewBox="0 0 24 24"
              >
                {recentItemsToast.kind === "error" ? (
                  <>
                    <path
                      d="M12 8v5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 16h.01"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                ) : (
                  <path
                    d="M5 12.5 9.5 17 19 7.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
              <span>{recentItemsToast.message}</span>
            </div>
          </div>
        </div>
      ) : null}

      {showDiagnosticsSection ? (
        <section className="card p-4 sm:p-5">
          <h2 className="mb-2 text-lg font-semibold">
            Demo extraction diagnostics
          </h2>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Last 10 runs only. Older diagnostics are pruned automatically.
          </p>

          {demoDiagnostics.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No extraction diagnostics yet.
            </p>
          ) : null}

          <div className="space-y-3">
            {demoDiagnostics.map((diagnostic) => (
              <article
                key={diagnostic.id}
                className="rounded-xl border p-3 sm:p-4"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`badge ${diagnostic.status.toLowerCase()}`}>
                    {diagnostic.status.toLowerCase()}
                  </span>
                  <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    {sourceTypeBadgeLabel(diagnostic.sourceType)}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {new Date(diagnostic.createdAt).toLocaleString()}
                  </span>
                </div>

                <h3 className="break-words font-semibold">
                  {diagnostic.itemTitle || "Untitled item"}
                </h3>
                <p className="mt-1 break-words text-xs text-[var(--muted)]">
                  {(diagnostic.sourceType === "URL" ||
                    diagnostic.sourceType === "HTML_SNAPSHOT") &&
                  diagnostic.sourceUrl ? (
                    <>
                      Source:{" "}
                      <a
                        className="break-all underline"
                        href={diagnostic.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {diagnostic.sourceUrl}
                      </a>
                    </>
                  ) : (
                    `Source: ${diagnostic.sourceLabel || "Uploaded PDF"}`
                  )}
                </p>
                {diagnostic.errorMessage ? (
                  <p className="mt-1 text-sm text-[var(--danger)]">
                    {diagnostic.errorMessage}
                  </p>
                ) : null}

                <details className="mt-3 rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Extraction log
                  </summary>
                  <div className="mt-2 space-y-2">
                    {diagnostic.logEntries.length === 0 ? (
                      <p className="text-xs text-[var(--muted)]">
                        No log entries captured.
                      </p>
                    ) : null}
                    {diagnostic.logEntries.map((entry, index) => (
                      <div
                        key={`${diagnostic.id}-log-${index}`}
                        className="rounded-md border p-2 text-xs"
                      >
                        <p className="font-medium">
                          [{new Date(entry.at).toLocaleTimeString()}]{" "}
                          {entry.stage}
                        </p>
                        <p className="mt-1">{entry.message}</p>
                        {entry.details ? (
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">
                            {JSON.stringify(entry.details, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </details>

                <details className="mt-3 rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Extracted text
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs">
                    {diagnostic.extractedText ||
                      "(No extracted text captured.)"}
                  </pre>
                </details>

                <details className="mt-3 rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Extracted markdown
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs">
                    {diagnostic.extractedMarkdown || "(No markdown captured.)"}
                  </pre>
                </details>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {showItemsSection && isAdmin && markdownPreview ? (
        <section className="card p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold">
              Markdown preview: {markdownPreview.title}
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
              <button
                className="rounded-lg border px-3 py-2 text-xs"
                onClick={() =>
                  navigator.clipboard.writeText(markdownPreview.content)
                }
              >
                Copy markdown
              </button>
              <button
                className="rounded-lg border px-3 py-2 text-xs"
                onClick={() => setMarkdownPreview(null)}
              >
                Close
              </button>
            </div>
          </div>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs">
            {markdownPreview.content || "(Markdown is empty.)"}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
