"use client";

import { useEffect, useState } from "react";

type SummaryStudioItem = {
  id: string;
  title: string | null;
  sourceType: string;
  sourceUrl: string | null;
  createdAt: string;
  defaultSelected: boolean;
};

type SummaryStudioRun = {
  id: string;
  requestedTitle: string | null;
  title: string | null;
  status: string;
  targetLengthMinutes: number;
  selectedItemCount: number;
  podcastEnabled: boolean;
  podcastStatus: string | null;
  podcastError: string | null;
  summaryProvider: string | null;
  summaryModel: string | null;
  summaryDeployment: string | null;
  fallbackUsed: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  completedAt: string | null;
  createdAt: string;
};

type Props = {
  initialItems: SummaryStudioItem[];
  initialRuns: SummaryStudioRun[];
};

const LENGTH_PRESETS: Array<{ value: 5 | 15 | 30; label: string; helper: string }> = [
  { value: 5, label: "Quick (5)", helper: "Fast recap" },
  { value: 15, label: "Standard (15)", helper: "Balanced roundup" },
  { value: 30, label: "Deep Dive (30)", helper: "Long-form synthesis" }
];

function badgeClass(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === "READY" || normalized === "SUCCEEDED") {
    return "badge ready";
  }
  if (normalized === "FAILED") {
    return "badge failed";
  }
  if (normalized === "PROCESSING") {
    return "badge processing";
  }
  return "badge queued";
}

function formatDate(value: string | null): string {
  if (!value) {
    return "In progress";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function runLabel(run: SummaryStudioRun): string {
  return run.title || run.requestedTitle || `Summary ${new Date(run.createdAt).toLocaleDateString()}`;
}

export function SummaryStudioClient({ initialItems, initialRuns }: Props) {
  const [items, setItems] = useState(initialItems);
  const [runs, setRuns] = useState(initialRuns);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(initialItems.filter((item) => item.defaultSelected).map((item) => item.id));
  const [search, setSearch] = useState("");
  const [requestedTitle, setRequestedTitle] = useState("");
  const [targetLengthMinutes, setTargetLengthMinutes] = useState<5 | 15 | 30>(15);
  const [podcastEnabled, setPodcastEnabled] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [markdownPreview, setMarkdownPreview] = useState<{ title: string; markdown: string } | null>(null);
  const [isMarkdownLoading, setIsMarkdownLoading] = useState(false);

  const filteredItems = items.filter((item) => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return [item.title || "", item.sourceUrl || "", item.sourceType].some((value) => value.toLowerCase().includes(query));
  });

  async function refreshItems(): Promise<void> {
    const response = await fetch(`/api/summary/items?limit=200`);
    const payload = (await response.json()) as { ok?: boolean; items?: SummaryStudioItem[]; error_message?: string };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error_message || "Unable to refresh saved articles.");
    }
    setItems(Array.isArray(payload.items) ? payload.items : []);
  }

  async function refreshRuns(): Promise<void> {
    const response = await fetch(`/api/summary/runs?limit=20`);
    const payload = (await response.json()) as { ok?: boolean; runs?: SummaryStudioRun[]; error_message?: string };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error_message || "Unable to refresh summary runs.");
    }
    setRuns(Array.isArray(payload.runs) ? payload.runs : []);
  }

  useEffect(() => {
    if (selectedRunId) {
      return;
    }
    const latestCompleted = runs.find((run) => run.status === "SUCCEEDED" || run.status === "SKIPPED");
    if (latestCompleted) {
      setSelectedRunId(latestCompleted.id);
    }
  }, [runs, selectedRunId]);

  useEffect(() => {
    if (!selectedRunId) {
      setMarkdownPreview(null);
      return;
    }

    const selectedRun = runs.find((run) => run.id === selectedRunId);
    if (!selectedRun || selectedRun.status !== "SUCCEEDED") {
      setMarkdownPreview(null);
      return;
    }

    let cancelled = false;
    setIsMarkdownLoading(true);
    fetch(`/api/summary/runs/${selectedRunId}/markdown`)
      .then(async (response) => {
        const payload = (await response.json()) as { ok?: boolean; title?: string; markdown?: string; error_message?: string };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error_message || "Unable to load summary markdown.");
        }
        if (!cancelled) {
          setMarkdownPreview({
            title: payload.title || runLabel(selectedRun),
            markdown: payload.markdown || ""
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : "Unable to load summary markdown.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsMarkdownLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [runs, selectedRunId]);

  useEffect(() => {
    const hasActiveRun = runs.some((run) => run.status === "QUEUED" || run.status === "PROCESSING");
    if (!hasActiveRun) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshRuns().catch(() => undefined);
    }, 4_000);

    return () => window.clearInterval(timer);
  }, [runs]);

  function toggleItem(itemId: string): void {
    setSelectedItemIds((current) => {
      if (current.includes(itemId)) {
        return current.filter((value) => value !== itemId);
      }
      if (current.length >= 30) {
        setStatusMessage("Summary Studio is capped at 30 selected articles per run.");
        return current;
      }
      return [...current, itemId];
    });
  }

  async function handleCreateSummary(): Promise<void> {
    if (selectedItemIds.length === 0) {
      setStatusMessage("Choose at least one saved article before creating a summary.");
      return;
    }

    setIsBusy(true);
    setStatusMessage("Creating summary run...");

    try {
      const response = await fetch("/api/summary/runs", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          itemIds: selectedItemIds,
          requestedTitle: requestedTitle.trim() || undefined,
          targetLengthMinutes,
          podcastEnabled
        })
      });
      const payload = (await response.json()) as { ok?: boolean; run?: SummaryStudioRun; error_message?: string };
      if (!response.ok || !payload.ok || !payload.run) {
        throw new Error(payload.error_message || "Unable to create summary.");
      }

      setRuns((current) => [payload.run as SummaryStudioRun, ...current].slice(0, 20));
      setSelectedRunId(payload.run.id);
      setStatusMessage("Summary run queued. The markdown and podcast will appear when processing finishes.");
      void refreshRuns().catch(() => undefined);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to create summary.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm text-[var(--muted)]">Summary Studio</p>
            <h1 className="font-bold text-2xl">Create a polished markdown roundup and podcast on demand.</h1>
            <p className="max-w-3xl text-sm text-[var(--muted)]">
              We preselect ready articles from the last 7 days. You can fine-tune the list, choose a length, and create one markdown summary
              that is easy to reuse for posts or narration.
            </p>
          </div>
          <div className="rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--ink)]">
            <div className="font-semibold">{selectedItemIds.length} article(s) selected</div>
            <div className="text-[var(--muted)]">Maximum 30 per summary run</div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="card p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-lg">Article Selection</h2>
                <p className="text-sm text-[var(--muted)]">Ready articles with markdown are available here.</p>
              </div>
              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={() => {
                  setStatusMessage("Refreshing saved articles...");
                  void refreshItems()
                    .then(() => setStatusMessage("Saved articles refreshed."))
                    .catch((error) => setStatusMessage(error instanceof Error ? error.message : "Unable to refresh saved articles."));
                }}
                type="button"
              >
                Refresh saved articles
              </button>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium">Search saved articles</span>
              <input
                className="w-full rounded-lg border px-3 py-2"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, URL, or source type"
                value={search}
              />
            </label>

            <div className="space-y-2 rounded-xl border p-3">
              {filteredItems.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No ready saved articles matched your search.</p>
              ) : (
                filteredItems.map((item) => {
                  const checked = selectedItemIds.includes(item.id);
                  return (
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                        checked ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-black/10"
                      }`}
                      key={item.id}
                    >
                      <input
                        checked={checked}
                        className="mt-1 h-4 w-4"
                        onChange={() => toggleItem(item.id)}
                        type="checkbox"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="font-medium">{item.title || "Untitled saved article"}</p>
                          <span className="text-xs text-[var(--muted)]">{new Date(item.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-[var(--muted)]">{item.sourceUrl || item.sourceType}</p>
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                          {item.sourceType}
                          {item.defaultSelected ? " • default 7-day selection" : ""}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section className="card p-4 sm:p-5">
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold text-lg">Summary Options</h2>
              <p className="text-sm text-[var(--muted)]">Choose the shape of the summary before queueing the run.</p>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium">Custom title</span>
              <input
                className="w-full rounded-lg border px-3 py-2"
                onChange={(event) => setRequestedTitle(event.target.value)}
                placeholder="Optional: exact title to use"
                value={requestedTitle}
              />
            </label>

            <div className="space-y-2">
              <span className="text-sm font-medium">Length preset</span>
              <div className="grid gap-2 sm:grid-cols-3">
                {LENGTH_PRESETS.map((preset) => (
                  <button
                    className={`rounded-xl border px-3 py-3 text-left ${
                      targetLengthMinutes === preset.value ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-black/10"
                    }`}
                    key={preset.value}
                    onClick={() => setTargetLengthMinutes(preset.value)}
                    type="button"
                  >
                    <div className="font-medium">{preset.label}</div>
                    <div className="text-sm text-[var(--muted)]">{preset.helper}</div>
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-xl border px-3 py-3">
              <input checked={podcastEnabled} onChange={(event) => setPodcastEnabled(event.target.checked)} type="checkbox" />
              <span>
                <span className="block font-medium">Create podcast episode too</span>
                <span className="block text-sm text-[var(--muted)]">Enabled by default. The audio will publish into your digest feed.</span>
              </span>
            </label>

            <button
              className="rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isBusy || selectedItemIds.length === 0 || selectedItemIds.length > 30}
              onClick={() => void handleCreateSummary()}
              type="button"
            >
              {isBusy ? "Creating..." : "Create summary"}
            </button>

            {statusMessage ? <p className="text-sm text-[var(--muted)]">{statusMessage}</p> : null}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="card p-4 sm:p-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-lg">Recent Runs</h2>
                <p className="text-sm text-[var(--muted)]">Queued, processing, and completed manual summaries.</p>
              </div>
              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={() => {
                  setStatusMessage("Refreshing summary runs...");
                  void refreshRuns()
                    .then(() => setStatusMessage("Summary runs refreshed."))
                    .catch((error) => setStatusMessage(error instanceof Error ? error.message : "Unable to refresh summary runs."));
                }}
                type="button"
              >
                Refresh
              </button>
            </div>

            <div className="space-y-3">
              {runs.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No manual summary runs yet.</p>
              ) : (
                runs.map((run) => (
                  <button
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      selectedRunId === run.id ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-black/10"
                    }`}
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    type="button"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="font-medium">{runLabel(run)}</p>
                        <p className="text-sm text-[var(--muted)]">
                          {run.selectedItemCount} item(s) • {run.targetLengthMinutes} min • {run.podcastEnabled ? "podcast on" : "markdown only"}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {run.summaryProvider ? `${run.summaryProvider} / ${run.summaryDeployment || run.summaryModel}` : "Waiting for model"}
                          {run.fallbackUsed ? " • nano retried on mini" : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-start gap-2 sm:items-end">
                        <span className={badgeClass(run.status)}>{run.status}</span>
                        <span className="text-xs text-[var(--muted)]">{formatDate(run.completedAt || run.createdAt)}</span>
                      </div>
                    </div>
                    {run.errorMessage ? <p className="mt-2 text-sm text-[var(--danger)]">{run.errorMessage}</p> : null}
                    {run.podcastStatus === "FAILED" && run.podcastError ? (
                      <p className="mt-2 text-sm text-[var(--danger)]">Podcast failed: {run.podcastError}</p>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="card p-4 sm:p-5">
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold text-lg">Markdown Output</h2>
              <p className="text-sm text-[var(--muted)]">Open any completed summary run to review or reuse its markdown.</p>
            </div>

            {isMarkdownLoading ? (
              <p className="text-sm text-[var(--muted)]">Loading markdown...</p>
            ) : markdownPreview ? (
              <div className="space-y-3">
                <div className="rounded-xl border bg-[var(--accent-soft)] px-3 py-3">
                  <div className="font-medium">{markdownPreview.title}</div>
                  <div className="text-sm text-[var(--muted)]">LinkedIn-friendly markdown and podcast-ready narration source.</div>
                </div>
                <textarea
                  className="min-h-[440px] w-full rounded-xl border px-3 py-3 font-mono text-sm"
                  readOnly
                  value={markdownPreview.markdown}
                />
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">Choose a completed run to load its markdown preview.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
