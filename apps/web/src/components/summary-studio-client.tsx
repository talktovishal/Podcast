"use client";

import { useEffect, useMemo, useState } from "react";

type ItemImportance = "LOW" | "MEDIUM" | "HIGH";

type SummaryStudioItem = {
  id: string;
  title: string | null;
  sourceType: string;
  sourceUrl: string | null;
  importance: string;
  tags: string[];
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

type SummaryUsageSnapshot = {
  hasPaidAccess: boolean;
  summaryLimitPer7Days: number | null;
  summariesUsedLast7Days: number;
  remainingSummariesLast7Days: number | null;
};

type Props = {
  initialItems: SummaryStudioItem[];
  initialRuns: SummaryStudioRun[];
  initialSummaryUsage: SummaryUsageSnapshot;
};

const LENGTH_PRESETS: Array<{
  value: 5 | 15 | 30;
  label: string;
  helper: string;
}> = [
  { value: 5, label: "Quick (5)", helper: "Fast recap" },
  { value: 15, label: "Standard (15)", helper: "Balanced roundup" },
  { value: 30, label: "Deep Dive (30)", helper: "Long-form synthesis" },
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
  return (
    run.title ||
    run.requestedTitle ||
    `Summary ${new Date(run.createdAt).toLocaleDateString()}`
  );
}

function formatRunStatus(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === "READY" || normalized === "SUCCEEDED") {
    return "Ready";
  }
  if (normalized === "FAILED") {
    return "Needs attention";
  }
  if (normalized === "PROCESSING") {
    return "Processing";
  }
  if (normalized === "SKIPPED") {
    return "Skipped";
  }
  return "Queued";
}

function runProgressMessage(run: SummaryStudioRun): string {
  const normalized = run.status.toUpperCase();
  if (normalized === "QUEUED") {
    return "Waiting for processing to start";
  }
  if (normalized === "PROCESSING") {
    return run.podcastEnabled
      ? "Creating your summary and audio draft"
      : "Creating your summary";
  }
  if (normalized === "FAILED") {
    return "Processing stopped before this summary could finish";
  }
  if (normalized === "SKIPPED") {
    return "This run finished without publishing a new summary";
  }
  if (run.podcastEnabled && run.podcastStatus === "SUCCEEDED") {
    return "Summary ready. Audio is now in your main private feed";
  }
  if (run.podcastEnabled && run.podcastStatus === "FAILED") {
    return "Summary ready. Audio publishing needs another try";
  }
  return "Summary ready";
}

function runFailureMessage(run: SummaryStudioRun): string | null {
  if (run.errorMessage) {
    return run.errorMessage;
  }
  if (run.status.toUpperCase() === "FAILED") {
    return "We couldn't finish this summary right now. Please try again.";
  }
  return null;
}

function runPodcastFailureMessage(run: SummaryStudioRun): string | null {
  if (run.podcastStatus?.toUpperCase() !== "FAILED") {
    return null;
  }
  return (
    run.podcastError ||
    "The summary is ready, but we couldn't publish the audio version. Please try again."
  );
}

export function SummaryStudioClient({ initialItems, initialRuns, initialSummaryUsage }: Props) {
  const [items, setItems] = useState(initialItems);
  const [runs, setRuns] = useState(initialRuns);
  const [summaryUsage, setSummaryUsage] = useState(initialSummaryUsage);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(
    initialItems.filter((item) => item.defaultSelected).map((item) => item.id),
  );
  const [search, setSearch] = useState("");
  const [requestedTitle, setRequestedTitle] = useState("");
  const [targetLengthMinutes, setTargetLengthMinutes] = useState<5 | 15 | 30>(
    15,
  );
  const [podcastEnabled, setPodcastEnabled] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [markdownPreview, setMarkdownPreview] = useState<{
    title: string;
    markdown: string;
  } | null>(null);
  const [isMarkdownLoading, setIsMarkdownLoading] = useState(false);

  const [selectedImportanceFilter, setSelectedImportanceFilter] = useState<
    "ALL" | ItemImportance
  >("ALL");
  const [selectedTagFilter, setSelectedTagFilter] = useState("ALL");
  const availableTagFilters = useMemo(() => {
    return Array.from(new Set(items.flatMap((item) => item.tags))).sort(
      (left, right) => left.localeCompare(right),
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (
        selectedImportanceFilter !== "ALL" &&
        item.importance !== selectedImportanceFilter
      ) {
        return false;
      }
      if (
        selectedTagFilter !== "ALL" &&
        !item.tags.includes(selectedTagFilter)
      ) {
        return false;
      }
      const query = search.trim().toLowerCase();
      if (!query) {
        return true;
      }
      return [item.title || "", item.sourceUrl || "", item.sourceType].some(
        (value) => value.toLowerCase().includes(query),
      );
    });
  }, [items, selectedImportanceFilter, selectedTagFilter, search]);
  const summaryBlocked =
    summaryUsage.hasPaidAccess &&
    summaryUsage.remainingSummariesLast7Days !== null &&
    summaryUsage.remainingSummariesLast7Days <= 0;

  async function refreshItems(): Promise<void> {
    const response = await fetch(`/api/summary/items?limit=200`);
    const payload = (await response.json()) as {
      ok?: boolean;
      items?: SummaryStudioItem[];
      error_message?: string;
    };
    if (!response.ok || !payload.ok) {
      throw new Error(
        payload.error_message || "Unable to refresh saved articles.",
      );
    }
    setItems(Array.isArray(payload.items) ? payload.items : []);
  }

  async function refreshRuns(): Promise<void> {
    const response = await fetch(`/api/summary/runs?limit=20`);
    const payload = (await response.json()) as {
      ok?: boolean;
      runs?: SummaryStudioRun[];
      error_message?: string;
    };
    if (!response.ok || !payload.ok) {
      throw new Error(
        payload.error_message || "Unable to refresh summary runs.",
      );
    }
    setRuns(Array.isArray(payload.runs) ? payload.runs : []);
  }

  useEffect(() => {
    if (
      selectedTagFilter !== "ALL" &&
      !availableTagFilters.includes(selectedTagFilter)
    ) {
      setSelectedTagFilter("ALL");
    }
  }, [availableTagFilters, selectedTagFilter]);

  useEffect(() => {
    if (selectedRunId) {
      return;
    }
    const latestCompleted = runs.find(
      (run) => run.status === "SUCCEEDED" || run.status === "SKIPPED",
    );
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
        const payload = (await response.json()) as {
          ok?: boolean;
          title?: string;
          markdown?: string;
          error_message?: string;
        };
        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.error_message || "Unable to load summary markdown.",
          );
        }
        if (!cancelled) {
          setMarkdownPreview({
            title: payload.title || runLabel(selectedRun),
            markdown: payload.markdown || "",
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStatusMessage(
            error instanceof Error
              ? error.message
              : "Unable to load summary markdown.",
          );
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
    const hasActiveRun = runs.some(
      (run) => run.status === "QUEUED" || run.status === "PROCESSING",
    );
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
        setStatusMessage("You can select up to 30 articles per summary run.");
        return current;
      }
      return [...current, itemId];
    });
  }

  async function handleCreateSummary(): Promise<void> {
    if (selectedItemIds.length === 0) {
      setStatusMessage(
        "Choose at least one saved article before creating a summary.",
      );
      return;
    }

    if (summaryBlocked) {
      setStatusMessage(
        `This Pro plan has reached its ${summaryUsage.summaryLimitPer7Days ?? 0}-summary limit for the last 7 days. Try again later.`,
      );
      return;
    }

    setIsBusy(true);
    setStatusMessage("Creating summary run...");

    try {
      const response = await fetch("/api/summary/runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          itemIds: selectedItemIds,
          requestedTitle: requestedTitle.trim() || undefined,
          targetLengthMinutes,
          podcastEnabled,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        run?: SummaryStudioRun;
        error_message?: string;
      };
      if (!response.ok || !payload.ok || !payload.run) {
        throw new Error(payload.error_message || "Unable to create summary.");
      }

      setRuns((current) =>
        [payload.run as SummaryStudioRun, ...current].slice(0, 20),
      );
      setSummaryUsage((current) =>
        current.hasPaidAccess
          ? {
              ...current,
              summariesUsedLast7Days: current.summariesUsedLast7Days + 1,
              remainingSummariesLast7Days:
                current.remainingSummariesLast7Days === null
                  ? null
                  : Math.max(0, current.remainingSummariesLast7Days - 1),
            }
          : current,
      );
      setSelectedRunId(payload.run.id);
      setStatusMessage(
        podcastEnabled
          ? "Summary requested. Waiting for processing to start. When it's ready, the audio version will appear in your main feed."
          : "Summary requested. Waiting for processing to start.",
      );
      void refreshRuns().catch(() => undefined);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Unable to create summary.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="space-y-2">
            <p className="text-sm text-[var(--muted)]">Summaries</p>
            <h2 className="max-w-4xl font-bold text-2xl leading-tight sm:text-[2rem]">
              Create a polished markdown roundup and optional podcast on demand.
            </h2>
            <p className="max-w-3xl text-sm text-[var(--muted)] sm:text-base">
              We preselect ready articles from the last 7 days. Keep the list
              simple, choose a length, and turn the selection into one reusable
              summary.
            </p>
          </div>
          <div className="rounded-2xl border border-[rgba(31,122,90,0.14)] bg-[var(--accent-soft)]/75 px-4 py-3 text-sm text-[var(--ink)]">
            <div className="font-semibold">
              {selectedItemIds.length} article(s) selected
            </div>
            <div className="text-[var(--muted)]">
              Maximum 30 per summary run
            </div>
            {summaryUsage.hasPaidAccess && summaryUsage.summaryLimitPer7Days !== null ? (
              <div className="mt-2 text-[var(--muted)]">
                {summaryUsage.remainingSummariesLast7Days ?? 0} of {summaryUsage.summaryLimitPer7Days} summaries left in the last 7 days
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)] lg:items-start">
        <section className="card p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-lg">Article Selection</h2>
                <p className="text-sm text-[var(--muted)]">
                  Ready articles with markdown are available here.
                </p>
              </div>
              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={() => {
                  setStatusMessage("Refreshing saved articles...");
                  void refreshItems()
                    .then(() => setStatusMessage("Saved articles refreshed."))
                    .catch((error) =>
                      setStatusMessage(
                        error instanceof Error
                          ? error.message
                          : "Unable to refresh saved articles.",
                      ),
                    );
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
                placeholder="Search by title, URL, or source"
                value={search}
              />
            </label>

            <div className="grid grid-cols-1 gap-3 rounded-xl border border-[rgba(31,42,31,0.12)] bg-[var(--surface)]/70 p-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Filter by importance
                </span>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={selectedImportanceFilter}
                  onChange={(event) =>
                    setSelectedImportanceFilter(
                      event.target.value as "ALL" | ItemImportance,
                    )
                  }
                >
                  <option value="ALL">All importance levels</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Filter by tag
                </span>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={selectedTagFilter}
                  onChange={(event) => setSelectedTagFilter(event.target.value)}
                >
                  <option value="ALL">All tags</option>
                  {availableTagFilters.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-2 rounded-2xl border p-2 sm:p-3 lg:max-h-[34rem] lg:overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-1 py-2 text-sm text-[var(--muted)]">
                  No ready saved articles are available yet.
                </p>
              ) : filteredItems.length === 0 ? (
                <p className="px-1 py-2 text-sm text-[var(--muted)]">
                  No articles match the current search or filters.
                </p>
              ) : (
                filteredItems.map((item) => {
                  const checked = selectedItemIds.includes(item.id);
                  return (
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition ${
                        checked
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-black/10"
                      }`}
                      key={item.id}
                    >
                      <input
                        checked={checked}
                        className="mt-1 h-4 w-4"
                        onChange={() => toggleItem(item.id)}
                        type="checkbox"
                      />
                      <span className="min-w-0 flex-1 text-sm font-medium leading-6 text-[var(--ink)]">
                        {item.title || "Untitled saved article"}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section className="card p-4 sm:p-5 lg:sticky lg:top-6">
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold text-lg">Summary Options</h2>
              <p className="text-sm text-[var(--muted)]">
                Choose the shape of the summary before queueing the run.
              </p>
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
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {LENGTH_PRESETS.map((preset) => (
                  <button
                    className={`rounded-xl border px-3 py-3 text-left ${
                      targetLengthMinutes === preset.value
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-black/10"
                    }`}
                    key={preset.value}
                    onClick={() => setTargetLengthMinutes(preset.value)}
                    type="button"
                  >
                    <div className="font-medium">{preset.label}</div>
                    <div className="text-sm text-[var(--muted)]">
                      {preset.helper}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-[rgba(247,251,250,0.92)] px-3 py-3 text-sm text-[var(--muted)]">
              Selected articles become one markdown roundup. You can review the
              output below before reusing it anywhere else.
            </div>

            {summaryUsage.hasPaidAccess && summaryUsage.summaryLimitPer7Days !== null ? (
              <div
                className={`rounded-xl border px-3 py-3 text-sm ${
                  summaryBlocked
                    ? "border-[#f4c7c3] bg-[#fff5f5] text-[#8a271f]"
                    : "border-[#cfe7df] bg-[#f1faf7] text-[#155240]"
                }`}
              >
                Manual summaries: {summaryUsage.summariesUsedLast7Days} of {summaryUsage.summaryLimitPer7Days} used in the last 7 days.
              </div>
            ) : null}

            <button
              className="w-full rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                isBusy ||
                summaryBlocked ||
                selectedItemIds.length === 0 ||
                selectedItemIds.length > 30
              }
              onClick={() => void handleCreateSummary()}
              type="button"
            >
              {isBusy ? "Creating..." : "Create summary"}
            </button>

            {statusMessage ? (
              <p className="text-sm text-[var(--muted)]">{statusMessage}</p>
            ) : null}
          </div>
        </section>
      </div>

      <section className="card p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <h2 className="font-semibold text-lg">Podcast Publish</h2>
            <p className="text-sm text-[var(--muted)]">
              Keep this off unless you want the finished summary to also become
              an audio episode. When enabled, it appears in your main private
              podcast feed alongside your regular episodes.
            </p>
          </div>

          <label className="flex items-center gap-3 rounded-xl border px-4 py-3">
            <input
              checked={podcastEnabled}
              onChange={(event) => setPodcastEnabled(event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="block font-medium">Also publish as podcast</span>
              <span className="block text-sm text-[var(--muted)]">
                Optional for this run.
              </span>
            </span>
          </label>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="card p-4 sm:p-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-lg">Recent Runs</h2>
                <p className="text-sm text-[var(--muted)]">
                  Queued, processing, and completed manual summaries.
                </p>
              </div>
              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={() => {
                  setStatusMessage("Refreshing summary runs...");
                  void refreshRuns()
                    .then(() => setStatusMessage("Summary runs refreshed."))
                    .catch((error) =>
                      setStatusMessage(
                        error instanceof Error
                          ? error.message
                          : "Unable to refresh summary runs.",
                      ),
                    );
                }}
                type="button"
              >
                Refresh
              </button>
            </div>

            <div className="space-y-3">
              {runs.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  No manual summary runs yet.
                </p>
              ) : (
                runs.map((run) => (
                  <button
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      selectedRunId === run.id
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-black/10"
                    }`}
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    type="button"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="font-medium">{runLabel(run)}</p>
                        <p className="text-sm text-[var(--muted)]">
                          {run.selectedItemCount} item(s) •{" "}
                          {run.targetLengthMinutes} min •{" "}
                          {run.podcastEnabled ? "podcast on" : "markdown only"}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {runProgressMessage(run)}
                        </p>
                      </div>
                      <div className="flex flex-col items-start gap-2 sm:items-end">
                        <span className={badgeClass(run.status)}>
                          {formatRunStatus(run.status)}
                        </span>
                        <span className="text-xs text-[var(--muted)]">
                          {formatDate(run.completedAt || run.createdAt)}
                        </span>
                      </div>
                    </div>
                    {runFailureMessage(run) ? (
                      <p className="mt-2 text-sm text-[var(--danger)]">
                        {runFailureMessage(run)}
                      </p>
                    ) : null}
                    {runPodcastFailureMessage(run) ? (
                      <p className="mt-2 text-sm text-[var(--danger)]">
                        {runPodcastFailureMessage(run)}
                      </p>
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
              <p className="text-sm text-[var(--muted)]">
                Open any completed summary run to review or reuse its markdown.
              </p>
            </div>

            {isMarkdownLoading ? (
              <p className="text-sm text-[var(--muted)]">Loading markdown...</p>
            ) : markdownPreview ? (
              <div className="space-y-3">
                <div className="rounded-xl border bg-[var(--accent-soft)] px-3 py-3">
                  <div className="font-medium">{markdownPreview.title}</div>
                  <div className="text-sm text-[var(--muted)]">
                    LinkedIn-friendly markdown and podcast-ready narration
                    source.
                  </div>
                </div>
                <textarea
                  className="min-h-[440px] w-full rounded-xl border px-3 py-3 font-mono text-sm"
                  readOnly
                  value={markdownPreview.markdown}
                />
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                Choose a completed run to load its markdown preview.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
