"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DemoExtractionDiagnostic } from "@/lib/demo-diagnostics";

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
        audioPath: string;
        audioBytes: number;
        mimeType: string;
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

type Props = {
  feedUrl: string;
  feedToken: string;
  isDemoAccount?: boolean;
  initialTtsSelection: {
    providerId: string;
    voice: string;
  };
  ttsCatalog: TtsCatalog;
  ttsAvailability: TtsAvailability;
  readOnly?: boolean;
  initialDemoDiagnostics?: DemoExtractionDiagnostic[];
  initialItems: DashboardItem[];
};

function isPendingStatus(status: string): boolean {
  const normalized = status.toUpperCase();
  return normalized === "QUEUED" || normalized === "PROCESSING";
}

function statusHelpText(status: string): string | null {
  const normalized = status.toUpperCase();
  if (normalized === "QUEUED") {
    return "Queued. Waiting for worker to start processing.";
  }

  if (normalized === "PROCESSING") {
    return "Processing in progress. Audio will appear when complete.";
  }

  if (normalized === "READY") {
    return "Ready. Episode is available to play and export via RSS.";
  }

  return null;
}

export function DashboardClient({
  feedUrl,
  feedToken,
  isDemoAccount = false,
  initialTtsSelection,
  ttsCatalog,
  ttsAvailability,
  readOnly = false,
  initialDemoDiagnostics = [],
  initialItems
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [demoDiagnostics, setDemoDiagnostics] = useState(initialDemoDiagnostics);
  const [sourceMode, setSourceMode] = useState<"url" | "pdf">("url");
  const [urlInput, setUrlInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [ttsVoice, setTtsVoice] = useState(initialTtsSelection.voice);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [isTtsBusy, setIsTtsBusy] = useState(false);
  const [extensionConnectCode, setExtensionConnectCode] = useState<string | null>(null);
  const [extensionCodeExpiresAt, setExtensionCodeExpiresAt] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

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
    const response = await fetch("/api/seed-demo?refresh=items");
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as {
      items: DashboardItem[];
      extractionDiagnostics?: DemoExtractionDiagnostic[];
    };
    setItems(payload.items);
    if (isDemoAccount && Array.isArray(payload.extractionDiagnostics)) {
      setDemoDiagnostics(payload.extractionDiagnostics);
    }
  }, [isDemoAccount]);

  useEffect(() => {
    if (readOnly || inProgressCount === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshItems();
    }, 2500);

    return () => {
      window.clearInterval(interval);
    };
  }, [inProgressCount, readOnly, refreshItems]);

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
        body: JSON.stringify({ url: urlInput, title: titleInput.trim() || undefined })
      });
      const json = await response.json();

      if (!response.ok) {
        setStatusMessage(json.error_message || "Failed to submit URL.");
        return;
      }

      setStatusMessage("URL received. Processing has started and status will update automatically.");
      setUrlInput("");
      setTitleInput("");
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
      setStatusMessage("Extension connect code generated. Paste it into the Chrome extension popup.");
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

  async function submitActiveSource() {
    if (sourceMode === "url") {
      await submitUrl();
      return;
    }

    await submitPdf();
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
    <div className="space-y-6">
	      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-[var(--muted)]">Private feed URL</p>
          <code className="block flex-1 overflow-x-auto rounded-md bg-slate-100 p-2 text-xs">{feedUrl}</code>
          <button className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => navigator.clipboard.writeText(feedUrl)}>
            Copy
          </button>
          {!readOnly ? (
            <button className="rounded-lg border px-3 py-1.5 text-sm" onClick={rotateToken} disabled={isBusy}>
              Rotate token
            </button>
          ) : null}
          {!readOnly ? (
            <button className="rounded-lg border px-3 py-1.5 text-sm" onClick={createShareLink}>
              Create read-only link
            </button>
          ) : null}
        </div>
      </section>

      {!readOnly ? (
        <section className="card p-5">
          <h2 className="text-base font-semibold">Chrome Extension</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Generate a one-time connect code, then paste it into the extension popup to authorize page capture.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="rounded-lg border px-3 py-1.5 text-sm" onClick={generateExtensionConnectCode} disabled={isBusy}>
              Generate connect code
            </button>
            {extensionConnectCode ? (
              <button
                className="rounded-lg border px-3 py-1.5 text-sm"
                onClick={() => navigator.clipboard.writeText(extensionConnectCode)}
              >
                Copy code
              </button>
            ) : null}
          </div>
          {extensionConnectCode ? (
            <div className="mt-3 rounded-lg border bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">One-time connect code</p>
              <code className="mt-1 block overflow-x-auto text-sm">{extensionConnectCode}</code>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Expires: {extensionCodeExpiresAt ? new Date(extensionCodeExpiresAt).toLocaleString() : "soon"}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {!readOnly ? (
        <section className="card p-5">
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="rounded-lg border px-3 py-1.5 text-sm" disabled={isTtsBusy} onClick={previewVoice}>
              Preview Voice
            </button>
            <button
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isTtsBusy || !ttsVoice}
              onClick={saveTtsSettings}
            >
              Save Default
            </button>
          </div>

          {previewAudioUrl ? (
            <div className="mt-3">
              <audio controls className="w-full" preload="none" src={previewAudioUrl} />
            </div>
          ) : null}
        </section>
      ) : null}

      {!readOnly ? (
        <section className="card p-5">
          <h2 className="text-base font-semibold">Add New Episode</h2>

          <fieldset className="mt-3">
            <legend className="sr-only">Choose source</legend>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium transition ${
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
                className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium transition ${
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
              </article>
            ) : (
              <article>
                <label className="mb-1 block text-sm font-medium">PDF</label>
                <input
                  ref={pdfInputRef}
                  className="block w-full text-sm"
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
              </article>
            )}

            <button
              className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isBusy || (sourceMode === "url" ? !urlInput.trim() : !pdfFile)}
              onClick={submitActiveSource}
            >
              {sourceMode === "url" ? "Submit URL" : "Upload PDF"}
            </button>
          </div>
        </section>
      ) : null}

      {statusMessage ? <p className="text-sm text-[var(--muted)]">{statusMessage}</p> : null}
      {inProgressCount > 0 ? (
        <p className="rounded-lg border border-[#fce8b2] bg-[#fff6d9] px-3 py-2 text-sm text-[#6f5200]">
          Processing in progress for {inProgressCount} item{inProgressCount === 1 ? "" : "s"}. This list refreshes automatically.
        </p>
      ) : null}

      <section className="card p-5">
        <h2 className="mb-4 text-lg font-semibold">Recent items</h2>

        <div className="space-y-3">
          {newestFirst.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No items yet. Submit a URL or upload a PDF.</p>
          ) : null}

	          {newestFirst.map((item) => {
            const badgeClass = item.status.toLowerCase();
            const statusText = item.status.toUpperCase();
            const mediaUrl = item.episode ? `/api/media/${item.episode.audioPath}?feed_token=${feedToken}` : null;
            const helpText = statusHelpText(item.status);
            const showRetry = statusText === "FAILED";

	            return (
	              <article key={item.id} className="rounded-xl border p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`badge ${badgeClass}`}>{item.status.toLowerCase()}</span>
                  <span className="text-xs uppercase tracking-wide text-[var(--muted)]">{item.sourceType}</span>
                  <span className="text-xs text-[var(--muted)]">{new Date(item.createdAt).toLocaleString()}</span>
                </div>

	                <h3 className="font-semibold">{item.title || "Untitled item"}</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {item.sourceType === "URL" || item.sourceType === "HTML_SNAPSHOT" ? (
                      item.sourceUrl ? (
                        <>
                          Source:{" "}
                          <a className="underline" href={item.sourceUrl} target="_blank" rel="noreferrer">
                            {item.sourceUrl}
                          </a>
                        </>
                      ) : (
                        item.sourceType === "URL" ? "Source: URL" : "Source: Captured browser page"
                      )
                    ) : (
                      "Source: Uploaded PDF"
                    )}
                  </p>
	                {helpText ? <p className="mt-1 text-xs text-[var(--muted)]">{helpText}</p> : null}
	                {item.errorMessage ? <p className="mt-1 text-sm text-[var(--danger)]">{item.errorMessage}</p> : null}

                {mediaUrl ? (
                  <div className="mt-3 space-y-2">
                    <audio controls className="w-full" preload="none" src={mediaUrl} />
                    <a className="text-sm underline" href={mediaUrl}>
                      Download
                    </a>
                  </div>
                ) : null}

                {!readOnly ? (
                  <div className="mt-3 flex gap-2">
                    {showRetry ? (
                      <button className="rounded-lg border px-3 py-1.5 text-xs" onClick={() => retryItem(item.id)}>
                        Retry
                      </button>
                    ) : null}
                    <button className="rounded-lg border px-3 py-1.5 text-xs" onClick={() => deleteItem(item.id)}>
                      Delete
                    </button>
                  </div>
                ) : null}
              </article>
            );
	          })}
	        </div>
	      </section>

      {!readOnly && isDemoAccount ? (
        <section className="card p-5">
          <h2 className="mb-2 text-lg font-semibold">Demo extraction diagnostics</h2>
          <p className="mb-4 text-sm text-[var(--muted)]">Last 10 runs only. Older diagnostics are pruned automatically.</p>

          {demoDiagnostics.length === 0 ? <p className="text-sm text-[var(--muted)]">No extraction diagnostics yet.</p> : null}

          <div className="space-y-3">
            {demoDiagnostics.map((diagnostic) => (
              <article key={diagnostic.id} className="rounded-xl border p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`badge ${diagnostic.status.toLowerCase()}`}>{diagnostic.status.toLowerCase()}</span>
                  <span className="text-xs uppercase tracking-wide text-[var(--muted)]">{diagnostic.sourceType}</span>
                  <span className="text-xs text-[var(--muted)]">{new Date(diagnostic.createdAt).toLocaleString()}</span>
                </div>

                <h3 className="font-semibold">{diagnostic.itemTitle || "Untitled item"}</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {(diagnostic.sourceType === "URL" || diagnostic.sourceType === "HTML_SNAPSHOT") && diagnostic.sourceUrl ? (
                    <>
                      Source:{" "}
                      <a className="underline" href={diagnostic.sourceUrl} target="_blank" rel="noreferrer">
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
                        {entry.details ? <pre className="mt-2 overflow-x-auto">{JSON.stringify(entry.details, null, 2)}</pre> : null}
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
              </article>
            ))}
          </div>
        </section>
      ) : null}
	    </div>
	  );
}
