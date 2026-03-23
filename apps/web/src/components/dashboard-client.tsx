"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CopyableValueBox } from "@/components/copyable-value-box";
import type { DemoExtractionDiagnostic } from "@/lib/demo-diagnostics";
import {
  DEMOGRAPHIC_AGE_BANDS,
  DEMOGRAPHIC_GENDER_IDENTITIES,
  ageBandLabel,
  genderIdentityLabel,
  type DemographicAgeBand,
  type DemographicGenderIdentity,
  type UserDemographicSurveyView
} from "@/lib/demographics";
import { mergeItemsPreservingEpisodeTokens } from "@/lib/dashboard-items";
import { recommendsChromeExtensionCapture } from "@/lib/item-errors";
import { sourceFallbackLabel, sourceTypeBadgeLabel } from "@/lib/source-labels";

type DashboardItem = {
  id: string;
  title: string | null;
  sourceType: string;
  sourceUrl: string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  episode:
    | {
        id: string;
        audioPath: string;
        audioBytes: number;
        mimeType: string;
        mediaToken: string;
      }
    | null;
};

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

type DigestRun = {
  id: string;
  cadence: string;
  periodKey: string;
  status: string;
  sourceItemCount: number;
  scheduledFor: string;
  windowStart: string;
  windowEnd: string;
  emailEnabled: boolean;
  emailStatus: string | null;
  podcastEnabled: boolean;
  podcastStatus: string | null;
};

const WEEKDAY_OPTIONS: Array<{ label: string; value: number }> = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
  { label: "Saturday", value: 6 }
];

const LENGTH_OPTIONS: ReadonlyArray<5 | 15 | 30> = [5, 15, 30];
const CHROME_WEB_STORE_URL = "https://chromewebstore.google.com/detail/articlepod-capture/epjncnckcohefbopcbpfppfgljkkcmgp";
const ACTIVE_REFRESH_INTERVAL_MS = 3000;
const IDLE_REFRESH_INTERVAL_MS = 20000;

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
  weeklyLengthMinutes: 15
};

const DEFAULT_DEMOGRAPHIC_SURVEY: UserDemographicSurveyView = {
  status: "PENDING",
  ageBand: null,
  genderIdentity: null,
  genderSelfDescribe: null,
  completedAt: null,
  skippedAt: null,
  deletedAt: null,
  updatedAt: null
};

type Props = {
  feedUrl: string;
  isAdmin?: boolean;
  digestFeedUrl?: string;
  isDemoAccount?: boolean;
  initialSubmissionQuota?: SubmissionQuotaSnapshot | null;
  initialDigestSettings?: DigestSettings;
  initialDigestRuns?: DigestRun[];
  initialDemographicSurvey?: UserDemographicSurveyView;
  initialTtsSelection: {
    providerId: string;
    voice: string;
  };
  ttsCatalog: TtsCatalog;
  ttsAvailability: TtsAvailability;
  readOnly?: boolean;
  viewMode?: "workspace" | "settings";
  initialDemoDiagnostics?: DemoExtractionDiagnostic[];
  initialItems: DashboardItem[];
};

function isPendingStatus(status: string): boolean {
  const normalized = status.toUpperCase();
  return normalized === "QUEUED" || normalized === "PROCESSING";
}

function statusHelpText(status: string, processingMessage?: string | null): string | null {
  const normalized = status.toUpperCase();
  if (normalized === "QUEUED") {
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

export function DashboardClient({
  feedUrl,
  isAdmin = false,
  digestFeedUrl = "",
  isDemoAccount = false,
  initialSubmissionQuota = null,
  initialDigestSettings = DEFAULT_DIGEST_SETTINGS,
  initialDigestRuns = [],
  initialDemographicSurvey = DEFAULT_DEMOGRAPHIC_SURVEY,
  initialTtsSelection,
  ttsCatalog,
  ttsAvailability,
  readOnly = false,
  viewMode = "workspace",
  initialDemoDiagnostics = [],
  initialItems
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [submissionQuota] = useState(initialSubmissionQuota);
  const [demoDiagnostics, setDemoDiagnostics] = useState(initialDemoDiagnostics);
  const [sourceMode, setSourceMode] = useState<"url" | "pdf">("url");
  const [urlInput, setUrlInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [priorityInput, setPriorityInput] = useState<"LOW" | "MEDIUM" | "HIGH">("LOW");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isDigestBusy, setIsDigestBusy] = useState(false);
  const [ttsVoice, setTtsVoice] = useState(initialTtsSelection.voice);
  const [digestSettings, setDigestSettings] = useState<DigestSettings>(initialDigestSettings);
  const [digestRuns, setDigestRuns] = useState<DigestRun[]>(initialDigestRuns);
  const [demographicSurvey, setDemographicSurvey] = useState<UserDemographicSurveyView>(initialDemographicSurvey);
  const [isDemographicBusy, setIsDemographicBusy] = useState(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [isTtsBusy, setIsTtsBusy] = useState(false);
  const [extensionConnectCode, setExtensionConnectCode] = useState<string | null>(null);
  const [extensionCodeExpiresAt, setExtensionCodeExpiresAt] = useState<string | null>(null);
  const [markdownPreview, setMarkdownPreview] = useState<{ itemId: string; title: string; content: string } | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const isSettingsView = viewMode === "settings";
  const showFeedSection = readOnly || isSettingsView;
  const showSettingsSection = !readOnly && isSettingsView;
  const showSubmissionSection = !readOnly && !isSettingsView;
  const showExtensionSection = !readOnly;
  const showItemsSection = !isSettingsView;
  const showDiagnosticsSection = !readOnly && isDemoAccount && !isSettingsView;
  const showSubmissionQuota = showSubmissionSection && Boolean(submissionQuota);
  const submissionBlocked = showSubmissionQuota && !submissionQuota?.isPaid && (submissionQuota?.remainingFreeSubmissions ?? 0) <= 0;

  const newestFirst = useMemo(() => {
    return [...items].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [items]);
  const inProgressCount = useMemo(() => newestFirst.filter((item) => isPendingStatus(item.status)).length, [newestFirst]);
  const ttsVoicesForProvider = useMemo(() => {
    return ttsCatalog.voicesByProvider.kokoro || [];
  }, [ttsCatalog.voicesByProvider]);
  const selectedProviderAvailability = useMemo(() => ttsAvailability.kokoro, [ttsAvailability]);

  useEffect(() => {
    if (ttsVoicesForProvider.some((voice) => voice.id === ttsVoice)) {
      return;
    }

    const fallback = ttsCatalog.defaults.voiceByProvider.kokoro || ttsVoicesForProvider[0]?.id || "";
    if (fallback) {
      setTtsVoice(fallback);
    }
  }, [ttsCatalog.defaults.voiceByProvider, ttsVoice, ttsVoicesForProvider]);

  const refreshItems = useCallback(async () => {
    const response = await fetch(`/api/seed-demo?refresh=items&t=${Date.now()}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as {
      items: DashboardItem[];
      extractionDiagnostics?: DemoExtractionDiagnostic[];
    };
    setItems((previous) => mergeItemsPreservingEpisodeTokens(previous, payload.items));
    if (isDemoAccount && Array.isArray(payload.extractionDiagnostics)) {
      setDemoDiagnostics(payload.extractionDiagnostics);
    }
  }, [isDemoAccount]);

  const refreshDigestRuns = useCallback(async () => {
    const response = await fetch("/api/digest/runs?limit=20", {
      cache: "no-store"
    });
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as {
      runs?: DigestRun[];
    };
    setDigestRuns(Array.isArray(payload.runs) ? payload.runs : []);
  }, []);

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

    const intervalMs = inProgressCount > 0 ? ACTIVE_REFRESH_INTERVAL_MS : IDLE_REFRESH_INTERVAL_MS;
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

  async function submitUrl() {
    if (!urlInput) return;
    setIsBusy(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/items/url", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ url: urlInput, title: titleInput.trim() || undefined, priority: priorityInput })
      });
      const json = await response.json();

      if (!response.ok) {
        setStatusMessage(json.error_message || "Failed to submit URL.");
        return;
      }

      setStatusMessage("URL received. Processing has started and status will update automatically.");
      setUrlInput("");
      setTitleInput("");
      setPriorityInput("LOW");
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
      formData.set("priority", priorityInput);

      const response = await fetch("/api/items/pdf", {
        method: "POST",
        body: formData
      });

      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(json.error_message || "Failed to upload PDF.");
        return;
      }

      setStatusMessage("PDF uploaded. Processing has started and status will update automatically.");
      setPdfFile(null);
      setTitleInput("");
      setPriorityInput("LOW");
      if (pdfInputRef.current) {
        pdfInputRef.current.value = "";
      }
      await refreshItems();
    } finally {
      setIsBusy(false);
    }
  }

  async function rotateToken() {
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/feed-token/rotate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "manual rotation" })
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(json.error_message || "Token rotation failed.");
        return;
      }

      setStatusMessage(`Feed token rotated. New URL: ${json.feed_url}`);
      window.location.reload();
    } finally {
      setIsBusy(false);
    }
  }

  async function rotateDigestToken() {
    setIsDigestBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/digest-feed-token/rotate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "manual rotation" })
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(json.error_message || "Digest token rotation failed.");
        return;
      }

      setStatusMessage(`Digest feed token rotated. New URL: ${json.feed_url}`);
      window.location.reload();
    } finally {
      setIsDigestBusy(false);
    }
  }

  async function createShareLink() {
    const response = await fetch("/api/share/create", { method: "POST" });
    const json = await response.json();
    if (!response.ok) {
      setStatusMessage(json.error_message || "Failed to create share link.");
      return;
    }

    await navigator.clipboard.writeText(json.share_url);
    setStatusMessage("Read-only share URL copied to clipboard.");
  }

  async function generateExtensionConnectCode() {
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/auth/extension/connect-code", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ label: "chrome-extension" })
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(json.error_message || "Could not generate extension connect code.");
        return;
      }

      setExtensionConnectCode(json.connect_code);
      setExtensionCodeExpiresAt(json.expires_at);
      setStatusMessage("Extension connect code generated. It stays valid for 24 hours, and the extension stays connected for 1 year after pairing.");
    } finally {
      setIsBusy(false);
    }
  }

  async function revokeExtensionTokens() {
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/auth/extension/revoke", {
        method: "POST"
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(json.error_message || "Could not revoke extension tokens.");
        return;
      }
      setStatusMessage(`Revoked ${json.revoked ?? 0} extension token(s). Reconnect extension to continue captures.`);
      setExtensionConnectCode(null);
      setExtensionCodeExpiresAt(null);
    } finally {
      setIsBusy(false);
    }
  }

  async function retryItem(id: string) {
    await fetch(`/api/items/${id}/retry`, { method: "POST" });
    await refreshItems();
  }

  async function deleteItem(id: string) {
    await fetch(`/api/items/${id}`, { method: "DELETE" });
    await refreshItems();
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
      content: json.markdown || ""
    });
  }

  async function submitActiveSource() {
    if (sourceMode === "url") {
      await submitUrl();
      return;
    }

    await submitPdf();
  }

  async function saveDigestSettings() {
    setIsDigestBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/digest/settings", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(digestSettings)
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(json.error_message || "Could not save digest settings.");
        return;
      }
      setDigestSettings(json.settings as DigestSettings);
      setStatusMessage("Digest settings saved.");
      await refreshDigestRuns();
    } finally {
      setIsDigestBusy(false);
    }
  }

  async function saveTtsSettings() {
    setIsTtsBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/tts/settings", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          voice: ttsVoice
        })
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
      setStatusMessage("Select age band and gender identity before saving, or choose Skip for now.");
      return;
    }
    if (demographicSurvey.genderIdentity === "SELF_DESCRIBE" && !demographicSurvey.genderSelfDescribe?.trim()) {
      setStatusMessage("Add a self-description or choose a different gender identity option.");
      return;
    }

    setIsDemographicBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/account/demographics", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          action: "save",
          ageBand: demographicSurvey.ageBand,
          genderIdentity: demographicSurvey.genderIdentity,
          genderSelfDescribe: demographicSurvey.genderIdentity === "SELF_DESCRIBE" ? demographicSurvey.genderSelfDescribe : null
        })
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(json.error_message || "Could not save demographic profile.");
        return;
      }
      setDemographicSurvey(json.survey as UserDemographicSurveyView);
      setStatusMessage("Demographic profile saved.");
    } finally {
      setIsDemographicBusy(false);
    }
  }

  async function skipDemographicSurvey() {
    setIsDemographicBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/account/demographics", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          action: "skip"
        })
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(json.error_message || "Could not skip demographic profile.");
        return;
      }
      setDemographicSurvey(json.survey as UserDemographicSurveyView);
      setStatusMessage("Demographic profile skipped. You can update this anytime.");
    } finally {
      setIsDemographicBusy(false);
    }
  }

  async function deleteDemographicSurvey() {
    setIsDemographicBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/account/demographics", {
        method: "DELETE"
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(json.error_message || "Could not delete demographic profile.");
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
          "content-type": "application/json"
        },
        body: JSON.stringify({
          voice: ttsVoice
        })
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(json.error_message || "Could not generate preview audio.");
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
      {showFeedSection ? (
        <section className="card p-4 sm:p-5">
          <div className="space-y-3">
            <CopyableValueBox
              copiedMessage="Feed URL copied."
              idleMessage="Tap or click the box to copy your private feed URL."
              label="Private feed URL"
              value={feedUrl}
            />
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
              {!readOnly ? (
                <button className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto" onClick={rotateToken} disabled={isBusy}>
                  Rotate token
                </button>
              ) : null}
              {!readOnly ? (
                <button className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto" onClick={createShareLink}>
                  Create read-only link
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {showSettingsSection ? (
        <section className="card p-4 sm:p-5">
          <div className="space-y-3">
            <CopyableValueBox
              copiedMessage="Digest feed URL copied."
              idleMessage="Tap or click the box to copy your private digest feed URL."
              label="Digest feed URL"
              value={digestFeedUrl}
            />
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto" onClick={rotateDigestToken} disabled={isDigestBusy}>
                Rotate digest token
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {showExtensionSection ? (
        <section className="card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Chrome Extension</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Install ArticlePod Capture from Chrome Web Store, then generate a one-time connect code that stays valid for 24 hours. After you connect once, the extension stays authorized for 1 year unless you revoke it.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <a
              className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-center text-sm font-semibold text-white sm:w-auto"
              href={CHROME_WEB_STORE_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              Add to Chrome (Chrome Web Store)
            </a>
            <button className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto" onClick={generateExtensionConnectCode} disabled={isBusy}>
              Generate connect code
            </button>
            <button className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto" onClick={revokeExtensionTokens} disabled={isBusy}>
              Revoke extension tokens
            </button>
          </div>
          {extensionConnectCode ? (
            <div className="mt-3">
              <CopyableValueBox
                copiedMessage="Extension connect code copied."
                idleMessage="Tap or click the box to copy the one-time connect code."
                label="One-time connect code (24 hours)"
                value={extensionConnectCode}
                valueClassName="text-sm"
              />
              <p className="mt-2 text-xs text-[var(--muted)]">
                Expires: {extensionCodeExpiresAt ? new Date(extensionCodeExpiresAt).toLocaleString() : "soon"}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {showSettingsSection ? (
        <section className="card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Digest Settings</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Configure daily and weekly summary email/podcast generation.</p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Timezone (IANA)</span>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={digestSettings.timezone}
                onChange={(event) => setDigestSettings((current) => ({ ...current, timezone: event.target.value.trim() }))}
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
                  onChange={(event) => setDigestSettings((current) => ({ ...current, dailyEmailEnabled: event.target.checked }))}
                />
                Daily email
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={digestSettings.dailyPodcastEnabled}
                  onChange={(event) => setDigestSettings((current) => ({ ...current, dailyPodcastEnabled: event.target.checked }))}
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
                    setDigestSettings((current) => ({ ...current, dailyHour: Number.parseInt(event.target.value || "0", 10) || 0 }))
                  }
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
                    setDigestSettings((current) => ({ ...current, dailyMinute: Number.parseInt(event.target.value || "0", 10) || 0 }))
                  }
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
                      dailyLengthMinutes: Number.parseInt(event.target.value, 10) as 5 | 15 | 30
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
                  onChange={(event) => setDigestSettings((current) => ({ ...current, weeklyEmailEnabled: event.target.checked }))}
                />
                Weekly email
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={digestSettings.weeklyPodcastEnabled}
                  onChange={(event) => setDigestSettings((current) => ({ ...current, weeklyPodcastEnabled: event.target.checked }))}
                />
                Weekly podcast
              </label>
              <label className="block text-sm">
                <span className="mb-1 block">Day</span>
                <select
                  className="w-full rounded-lg border px-3 py-2"
                  value={digestSettings.weeklyDayOfWeek}
                  onChange={(event) =>
                    setDigestSettings((current) => ({ ...current, weeklyDayOfWeek: Number.parseInt(event.target.value, 10) || 0 }))
                  }
                >
                  {WEEKDAY_OPTIONS.map((option) => (
                    <option key={`weekly-day-${option.value}`} value={option.value}>
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
                    setDigestSettings((current) => ({ ...current, weeklyHour: Number.parseInt(event.target.value || "0", 10) || 0 }))
                  }
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
                    setDigestSettings((current) => ({ ...current, weeklyMinute: Number.parseInt(event.target.value || "0", 10) || 0 }))
                  }
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
                      weeklyLengthMinutes: Number.parseInt(event.target.value, 10) as 5 | 15 | 30
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
              onClick={saveDigestSettings}
            >
              Save digest settings
            </button>
          </div>
        </section>
      ) : null}

      {showSettingsSection ? (
        <section className="card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Optional Demographic Profile</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            This is optional and used only for aggregate product insights. You can skip now, edit later, or delete responses anytime.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Age band</span>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={demographicSurvey.ageBand ?? ""}
                onChange={(event) =>
                  setDemographicSurvey((current) => ({
                    ...current,
                    ageBand: (event.target.value || null) as DemographicAgeBand | null
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
              <span className="mb-1 block text-sm font-medium">Gender identity</span>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={demographicSurvey.genderIdentity ?? ""}
                onChange={(event) =>
                  setDemographicSurvey((current) => ({
                    ...current,
                    genderIdentity: (event.target.value || null) as DemographicGenderIdentity | null,
                    genderSelfDescribe: event.target.value === "SELF_DESCRIBE" ? current.genderSelfDescribe : null
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
              <span className="mb-1 block text-sm font-medium">Self-describe</span>
              <input
                className="w-full rounded-lg border px-3 py-2"
                maxLength={120}
                value={demographicSurvey.genderSelfDescribe ?? ""}
                onChange={(event) =>
                  setDemographicSurvey((current) => ({
                    ...current,
                    genderSelfDescribe: event.target.value
                  }))
                }
              />
            </label>
          ) : null}

          <p className="mt-3 text-xs text-[var(--muted)]">
            Current status: {demographicSurvey.status.toLowerCase()}
            {demographicSurvey.updatedAt ? ` · Updated ${new Date(demographicSurvey.updatedAt).toLocaleString()}` : ""}
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <button
              className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
              disabled={isDemographicBusy}
              onClick={saveDemographicSurvey}
            >
              Save demographic profile
            </button>
            <button
              className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto"
              disabled={isDemographicBusy}
              onClick={skipDemographicSurvey}
            >
              Skip for now
            </button>
            <button
              className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto"
              disabled={isDemographicBusy}
              onClick={deleteDemographicSurvey}
            >
              Delete responses
            </button>
          </div>
        </section>
      ) : null}

      {showSettingsSection ? (
        <section className="card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Recent Digest Runs</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Daily and weekly summary generation history.</p>

          <div className="mt-3 space-y-2">
            {digestRuns.length === 0 ? <p className="text-sm text-[var(--muted)]">No digest runs yet.</p> : null}
            {digestRuns.map((run) => (
              <article key={run.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`badge ${run.status.toLowerCase()}`}>{run.status.toLowerCase()}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 uppercase">{run.cadence.toLowerCase()}</span>
                  <span className="text-[var(--muted)]">period {run.periodKey}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Window: {new Date(run.windowStart).toLocaleString()} - {new Date(run.windowEnd).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Sources: {run.sourceItemCount} · Email: {run.emailEnabled ? run.emailStatus || "queued" : "off"} · Podcast:{" "}
                  {run.podcastEnabled ? run.podcastStatus || "queued" : "off"}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {showSettingsSection ? (
        <section className="card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Voice Settings</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Choose your default Kokoro voice for new episodes.</p>

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

          {selectedProviderAvailability && !selectedProviderAvailability.available ? (
            <p className="mt-2 text-xs text-[var(--danger)]">
              {selectedProviderAvailability.reason || "Selected provider is unavailable in this environment."}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-[var(--muted)]">Preview uses a fixed sample clip generated at startup and cached on disk.</p>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <button className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto" disabled={isTtsBusy} onClick={previewVoice}>
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
              <audio controls className="w-full" preload="metadata" src={previewAudioUrl} />
            </div>
          ) : null}
        </section>
      ) : null}

      {showSubmissionSection ? (
        <section className="card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Add New Episode</h2>
          {showSubmissionQuota ? (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                submissionBlocked ? "border-[#f9c6c3] bg-[#fff1f0] text-[#8d231f]" : "border-[#cfe7df] bg-[#f1faf7] text-[#155240]"
              }`}
            >
              {submissionQuota?.isPaid ? (
                <p>Paid plan active. Submissions are unlimited for this account.</p>
              ) : (
                <>
                  <p>
                    Free trial quota: {submissionQuota?.remainingFreeSubmissions ?? 0} of{" "}
                    {submissionQuota?.totalFreeSubmissionAllowance ?? 0} submissions remaining.
                  </p>
                  {submissionBlocked ? (
                    <p className="mt-1">
                      Trial quota is exhausted. Upgrade on the <Link className="underline" href="/pricing">pricing page</Link> or ask an
                      admin for extra tries.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <fieldset className="mt-3">
            <legend className="sr-only">Choose source</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label
                className={`cursor-pointer rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  sourceMode === "url"
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]"
                    : "border-[rgba(31,42,31,0.15)] bg-[var(--surface)] text-[var(--muted)] opacity-60"
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
                Option 1: URL
              </label>
              <label
                className={`cursor-pointer rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  sourceMode === "pdf"
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]"
                    : "border-[rgba(31,42,31,0.15)] bg-[var(--surface)] text-[var(--muted)] opacity-60"
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
                Option 2: PDF
              </label>
            </div>
          </fieldset>

          <div className="mt-3 space-y-3">
            {sourceMode === "url" ? (
              <article>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">URL</span>
                  <input
                    className="w-full rounded-lg border px-3 py-2"
                    placeholder="https://example.com/article"
                    value={urlInput}
                    onChange={(event) => setUrlInput(event.target.value)}
                  />
                </label>

                <label className="mt-3 block">
                  <span className="mb-1 block text-sm font-medium">Optional title</span>
                  <input
                    className="w-full rounded-lg border px-3 py-2"
                    placeholder="Leave blank to auto-title"
                    value={titleInput}
                    onChange={(event) => setTitleInput(event.target.value)}
                  />
                </label>

                <label className="mt-3 block">
                  <span className="mb-1 block text-sm font-medium">Priority</span>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={priorityInput}
                    onChange={(event) => setPriorityInput(event.target.value as "LOW" | "MEDIUM" | "HIGH")}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </label>
              </article>
            ) : (
              <article>
                <label className="mb-1 block text-sm font-medium">PDF</label>
                <input
                  ref={pdfInputRef}
                  className="block w-full rounded-lg border px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--accent-soft)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[var(--accent)]"
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => {
                    setPdfFile(event.target.files?.[0] ?? null);
                  }}
                />
                {pdfFile ? <p className="mt-2 text-xs text-[var(--muted)]">Selected file: {pdfFile.name}</p> : null}

                <label className="mt-3 block">
                  <span className="mb-1 block text-sm font-medium">Optional title</span>
                  <input
                    className="w-full rounded-lg border px-3 py-2"
                    placeholder="Leave blank to auto-title"
                    value={titleInput}
                    onChange={(event) => setTitleInput(event.target.value)}
                  />
                </label>

                <label className="mt-3 block">
                  <span className="mb-1 block text-sm font-medium">Priority</span>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={priorityInput}
                    onChange={(event) => setPriorityInput(event.target.value as "LOW" | "MEDIUM" | "HIGH")}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </label>
              </article>
            )}

            <button
              className="mt-3 w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
              disabled={submissionBlocked || isBusy || (sourceMode === "url" ? !urlInput.trim() : !pdfFile)}
              onClick={submitActiveSource}
            >
              {sourceMode === "url" ? "Submit URL" : "Upload PDF"}
            </button>
          </div>
        </section>
      ) : null}

      {statusMessage ? <p className="text-sm text-[var(--muted)]">{statusMessage}</p> : null}
      {showItemsSection && inProgressCount > 0 ? (
        <p className="rounded-lg border border-[#fce8b2] bg-[#fff6d9] px-3 py-2 text-sm text-[#6f5200]">
          Processing in progress for {inProgressCount} item{inProgressCount === 1 ? "" : "s"}. This list refreshes automatically.
        </p>
      ) : null}

      {showItemsSection ? (
        <section className="card p-4 sm:p-5">
          <h2 className="mb-4 text-lg font-semibold">Recent items</h2>

          <div className="space-y-3">
            {newestFirst.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No items yet. Submit a URL or upload a PDF.</p>
            ) : null}

            {newestFirst.map((item) => {
              const badgeClass = item.status.toLowerCase();
              const statusText = item.status.toUpperCase();
              const mediaUrl = item.episode
                ? `/api/media/${item.episode.audioPath}?mt=${encodeURIComponent(item.episode.mediaToken)}&eid=${encodeURIComponent(item.episode.id)}`
                : null;
              const helpText = statusHelpText(item.status, item.errorMessage);
              const showRetry = statusText === "FAILED" && !recommendsChromeExtensionCapture(item.errorMessage);

              return (
                <article key={item.id} className="rounded-xl border p-3 sm:p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`badge ${badgeClass}`}>{item.status.toLowerCase()}</span>
                    <span className="text-xs uppercase tracking-wide text-[var(--muted)]">{sourceTypeBadgeLabel(item.sourceType)}</span>
                    <span className="text-xs text-[var(--muted)]">{new Date(item.createdAt).toLocaleString()}</span>
                  </div>

                  <h3 className="break-words font-semibold">{item.title || "Untitled item"}</h3>
                  <p className="mt-1 break-words text-xs text-[var(--muted)]">
                    {item.sourceType === "URL" || item.sourceType === "HTML_SNAPSHOT" ? (
                      item.sourceUrl ? (
                        <>
                          Source:{" "}
                          {item.sourceType === "HTML_SNAPSHOT" ? "Captured via Chrome extension from " : ""}
                          <a className="break-all underline" href={item.sourceUrl} target="_blank" rel="noreferrer">
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
                  {helpText ? <p className="mt-1 text-xs text-[var(--muted)]">{helpText}</p> : null}
                  {item.errorMessage && statusText === "FAILED" ? (
                    <p className="mt-1 text-sm text-[var(--danger)]">{item.errorMessage}</p>
                  ) : null}

                  {mediaUrl ? (
                    <div className="mt-3 space-y-2">
                      <audio controls className="w-full" preload="metadata" src={mediaUrl} />
                      <a className="text-sm underline" href={mediaUrl}>
                        Download
                      </a>
                    </div>
                  ) : null}

                  {!readOnly ? (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:gap-2">
                      {isAdmin ? (
                        <button
                          className="w-full rounded-lg border px-3 py-2 text-xs sm:w-auto"
                          onClick={() => viewMarkdown(item.id, item.title)}
                        >
                          View markdown
                        </button>
                      ) : null}
                      {showRetry ? (
                        <button className="w-full rounded-lg border px-3 py-2 text-xs sm:w-auto" onClick={() => retryItem(item.id)}>
                          Retry
                        </button>
                      ) : null}
                      <button className="w-full rounded-lg border px-3 py-2 text-xs sm:w-auto" onClick={() => deleteItem(item.id)}>
                        Delete
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {showDiagnosticsSection ? (
        <section className="card p-4 sm:p-5">
          <h2 className="mb-2 text-lg font-semibold">Demo extraction diagnostics</h2>
          <p className="mb-4 text-sm text-[var(--muted)]">Last 10 runs only. Older diagnostics are pruned automatically.</p>

          {demoDiagnostics.length === 0 ? <p className="text-sm text-[var(--muted)]">No extraction diagnostics yet.</p> : null}

          <div className="space-y-3">
            {demoDiagnostics.map((diagnostic) => (
              <article key={diagnostic.id} className="rounded-xl border p-3 sm:p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`badge ${diagnostic.status.toLowerCase()}`}>{diagnostic.status.toLowerCase()}</span>
                  <span className="text-xs uppercase tracking-wide text-[var(--muted)]">{sourceTypeBadgeLabel(diagnostic.sourceType)}</span>
                  <span className="text-xs text-[var(--muted)]">{new Date(diagnostic.createdAt).toLocaleString()}</span>
                </div>

                <h3 className="break-words font-semibold">{diagnostic.itemTitle || "Untitled item"}</h3>
                <p className="mt-1 break-words text-xs text-[var(--muted)]">
                  {(diagnostic.sourceType === "URL" || diagnostic.sourceType === "HTML_SNAPSHOT") && diagnostic.sourceUrl ? (
                    <>
                      Source:{" "}
                      <a className="break-all underline" href={diagnostic.sourceUrl} target="_blank" rel="noreferrer">
                        {diagnostic.sourceUrl}
                      </a>
                    </>
                  ) : (
                    `Source: ${diagnostic.sourceLabel || "Uploaded PDF"}`
                  )}
                </p>
                {diagnostic.errorMessage ? <p className="mt-1 text-sm text-[var(--danger)]">{diagnostic.errorMessage}</p> : null}

                <details className="mt-3 rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Extraction log</summary>
                  <div className="mt-2 space-y-2">
                    {diagnostic.logEntries.length === 0 ? <p className="text-xs text-[var(--muted)]">No log entries captured.</p> : null}
                    {diagnostic.logEntries.map((entry, index) => (
                      <div key={`${diagnostic.id}-log-${index}`} className="rounded-md border p-2 text-xs">
                        <p className="font-medium">
                          [{new Date(entry.at).toLocaleTimeString()}] {entry.stage}
                        </p>
                        <p className="mt-1">{entry.message}</p>
                        {entry.details ? (
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(entry.details, null, 2)}</pre>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </details>

                <details className="mt-3 rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Extracted text</summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs">
                    {diagnostic.extractedText || "(No extracted text captured.)"}
                  </pre>
                </details>

                <details className="mt-3 rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Extracted markdown</summary>
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
            <h2 className="text-base font-semibold">Markdown preview: {markdownPreview.title}</h2>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
              <button
                className="rounded-lg border px-3 py-2 text-xs"
                onClick={() => navigator.clipboard.writeText(markdownPreview.content)}
              >
                Copy markdown
              </button>
              <button className="rounded-lg border px-3 py-2 text-xs" onClick={() => setMarkdownPreview(null)}>
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
