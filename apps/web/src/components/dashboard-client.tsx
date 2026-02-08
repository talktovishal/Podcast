"use client";

import { useMemo, useState } from "react";

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

export function DashboardClient({ feedUrl, feedToken, readOnly = false, initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [urlInput, setUrlInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const newestFirst = useMemo(() => {
    return [...items].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [items]);

  async function refreshItems() {
    const response = await fetch("/api/seed-demo?refresh=items");
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { items: DashboardItem[] };
    setItems(payload.items);
  }

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
        body: JSON.stringify({ url: urlInput, title: titleInput || undefined })
      });
      const json = await response.json();

      if (!response.ok) {
        setStatusMessage(json.error_message || "Failed to submit URL.");
        return;
      }

      setStatusMessage("URL queued successfully.");
      setUrlInput("");
      setTitleInput("");
      await refreshItems();
    } finally {
      setIsBusy(false);
    }
  }

  async function submitPdf(file: File) {
    setIsBusy(true);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      if (titleInput) {
        formData.set("title", titleInput);
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

      setStatusMessage("PDF queued successfully.");
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
        <section className="card grid gap-4 p-5 md:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Optional title</span>
              <input className="w-full rounded-lg border px-3 py-2" value={titleInput} onChange={(event) => setTitleInput(event.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Article URL</span>
              <input className="w-full rounded-lg border px-3 py-2" placeholder="https://example.com/article" value={urlInput} onChange={(event) => setUrlInput(event.target.value)} />
            </label>
            <button className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={isBusy} onClick={submitUrl}>
              Submit URL
            </button>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Upload text-based PDF</p>
            <input
              className="block w-full text-sm"
              type="file"
              accept="application/pdf"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) submitPdf(file);
              }}
            />
          </div>
        </section>
      ) : null}

      {statusMessage ? <p className="text-sm text-[var(--muted)]">{statusMessage}</p> : null}

      <section className="card p-5">
        <h2 className="mb-4 text-lg font-semibold">Recent items</h2>

        <div className="space-y-3">
          {newestFirst.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No items yet. Submit a URL or upload a PDF.</p>
          ) : null}

          {newestFirst.map((item) => {
            const badgeClass = item.status.toLowerCase();
            const mediaUrl = item.episode ? `/api/media/${item.episode.audioPath}?feed_token=${feedToken}` : null;

            return (
              <article key={item.id} className="rounded-xl border p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`badge ${badgeClass}`}>{item.status.toLowerCase()}</span>
                  <span className="text-xs uppercase tracking-wide text-[var(--muted)]">{item.sourceType}</span>
                  <span className="text-xs text-[var(--muted)]">{new Date(item.createdAt).toLocaleString()}</span>
                </div>

                <h3 className="font-semibold">{item.title || "Untitled item"}</h3>
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
                    <button className="rounded-lg border px-3 py-1.5 text-xs" onClick={() => retryItem(item.id)}>
                      Retry
                    </button>
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
