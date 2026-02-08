"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DashboardItem = {
  id: string;
  title: string | null;
  sourceType: string;
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

type Props = {
  feedUrl: string;
  feedToken: string;
  readOnly?: boolean;
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

export function DashboardClient({ feedUrl, feedToken, readOnly = false, initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [urlInput, setUrlInput] = useState("");
  const [pdfTitleInput, setPdfTitleInput] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  const newestFirst = useMemo(() => {
    return [...items].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [items]);
  const inProgressCount = useMemo(() => newestFirst.filter((item) => isPendingStatus(item.status)).length, [newestFirst]);

  const refreshItems = useCallback(async () => {
    const response = await fetch("/api/seed-demo?refresh=items");
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { items: DashboardItem[] };
    setItems(payload.items);
  }, []);

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
        body: JSON.stringify({ url: urlInput })
      });
      const json = await response.json();

      if (!response.ok) {
        setStatusMessage(json.error_message || "Failed to submit URL.");
        return;
      }

      setStatusMessage("URL received. Processing has started and status will update automatically.");
      setUrlInput("");
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
      if (pdfTitleInput.trim()) {
        formData.set("title", pdfTitleInput.trim());
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
      setPdfTitleInput("");
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

  async function retryItem(id: string) {
    await fetch(`/api/items/${id}/retry`, { method: "POST" });
    await refreshItems();
  }

  async function deleteItem(id: string) {
    await fetch(`/api/items/${id}`, { method: "DELETE" });
    await refreshItems();
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
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Add New Episode</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Choose one source type per episode: URL or PDF.</p>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border p-4">
              <h3 className="font-semibold">Option 1: Submit URL</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Paste an article URL. ListenLater extracts the page title automatically, or infers one from content.
              </p>

              <label className="mt-3 block">
                <span className="mb-1 block text-sm font-medium">Article URL</span>
                <input
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="https://example.com/article"
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.target.value)}
                />
              </label>

              <button
                className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={isBusy || !urlInput.trim()}
                onClick={submitUrl}
              >
                Submit URL
              </button>
            </article>

            <article className="rounded-xl border p-4">
              <h3 className="font-semibold">Option 2: Upload PDF</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">Upload one text-based PDF file. OCR for scanned PDFs is not supported yet.</p>

              <label className="mt-3 block">
                <span className="mb-1 block text-sm font-medium">Optional PDF title</span>
                <input className="w-full rounded-lg border px-3 py-2" value={pdfTitleInput} onChange={(event) => setPdfTitleInput(event.target.value)} />
              </label>

              <input
                ref={pdfInputRef}
                className="mt-3 block w-full text-sm"
                type="file"
                accept="application/pdf"
                onChange={(event) => {
                  setPdfFile(event.target.files?.[0] ?? null);
                }}
              />
              {pdfFile ? <p className="mt-2 text-xs text-[var(--muted)]">Selected file: {pdfFile.name}</p> : null}

              <button
                className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={isBusy || !pdfFile}
                onClick={submitPdf}
              >
                Upload PDF
              </button>
            </article>
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
    </div>
  );
}
