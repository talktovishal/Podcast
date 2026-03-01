"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FEEDBACK_FEATURE_AREAS,
  FEEDBACK_MIRROR_STATUSES,
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  feedbackFeatureAreaLabel,
  feedbackTypeLabel
} from "@/lib/feedback";

type FeedbackRow = {
  id: string;
  userId: string;
  userEmail: string;
  message: string;
  feedbackType: string | null;
  feedbackTypeLabel: string;
  featureArea: string | null;
  featureAreaLabel: string;
  allowEmailContact: boolean;
  status: string;
  sourcePath: string | null;
  mirrorStatus: string;
  mirrorIssueNumber: number | null;
  mirrorIssueUrl: string | null;
  mirrorAttemptedAt: string | null;
  mirrorErrorCode: string | null;
  mirrorErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type FeedbackResponse = {
  ok: boolean;
  feedback?: {
    pagination: {
      page: number;
      pageSize: number;
      totalRows: number;
      totalPages: number;
    };
    rows: FeedbackRow[];
  };
  error_message?: string;
};

type FilterState = {
  status: string;
  feedbackType: string;
  featureArea: string;
  mirrorStatus: string;
  q: string;
};

const DEFAULT_FILTERS: FilterState = {
  status: "ALL",
  feedbackType: "ALL",
  featureArea: "ALL",
  mirrorStatus: "ALL",
  q: ""
};

export function AdminFeedbackInbox() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalRows: 0,
    totalPages: 1
  });
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [savingFeedbackId, setSavingFeedbackId] = useState<string | null>(null);
  const [mirroringFeedbackId, setMirroringFeedbackId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [filters.status, filters.feedbackType, filters.featureArea, filters.mirrorStatus, filters.q]);

  async function loadFeedback(activePage = page) {
    setLoading(true);
    setStatusMessage(null);
    try {
      const query = new URLSearchParams({
        status: filters.status,
        feedbackType: filters.feedbackType,
        featureArea: filters.featureArea,
        mirrorStatus: filters.mirrorStatus,
        page: String(activePage),
        page_size: "20"
      });
      if (filters.q.trim()) {
        query.set("q", filters.q.trim());
      }

      const response = await fetch(`/api/admin/feedback?${query.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as FeedbackResponse;
      if (!response.ok || !payload.ok || !payload.feedback) {
        setStatusMessage(payload.error_message || "Could not load feedback inbox.");
        return;
      }

      setRows(payload.feedback.rows);
      setPagination(payload.feedback.pagination);
      setStatusDrafts(
        Object.fromEntries(payload.feedback.rows.map((row) => [row.id, row.status]))
      );
    } catch {
      setStatusMessage("Could not load feedback inbox.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFeedback(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters.status, filters.feedbackType, filters.featureArea, filters.mirrorStatus, filters.q]);

  const dirtyRows = useMemo(() => {
    return rows.filter((row) => (statusDrafts[row.id] || row.status) !== row.status).length;
  }, [rows, statusDrafts]);

  async function saveStatus(row: FeedbackRow) {
    const nextStatus = statusDrafts[row.id] || row.status;
    if (nextStatus === row.status) {
      return;
    }

    setSavingFeedbackId(row.id);
    setStatusMessage(null);
    try {
      const response = await fetch(`/api/admin/feedback/${row.id}/status`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ status: nextStatus })
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error_message?: string;
      };
      if (!response.ok || !payload.ok) {
        setStatusMessage(payload.error_message || "Could not update feedback status.");
        return;
      }
      setStatusMessage("Feedback status updated.");
      await loadFeedback(page);
    } catch {
      setStatusMessage("Could not update feedback status.");
    } finally {
      setSavingFeedbackId(null);
    }
  }

  async function retryMirror(row: FeedbackRow) {
    setMirroringFeedbackId(row.id);
    setStatusMessage(null);
    try {
      const response = await fetch(`/api/admin/feedback/${row.id}/mirror`, {
        method: "POST"
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error_message?: string;
      };
      if (!response.ok || !payload.ok) {
        setStatusMessage(payload.error_message || "Could not retry GitHub mirror.");
        return;
      }
      setStatusMessage("Mirror retry complete.");
      await loadFeedback(page);
    } catch {
      setStatusMessage("Could not retry GitHub mirror.");
    } finally {
      setMirroringFeedbackId(null);
    }
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Feedback inbox</h2>
          <p className="text-sm text-[var(--muted)]">Review suggestions, update status, and retry GitHub mirroring when needed.</p>
        </div>
        <p className="text-xs text-[var(--muted)]">Unsaved status rows: {dirtyRows}</p>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-5">
        <label className="text-xs">
          Status
          <select
            className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="ALL">All statuses</option>
            {FEEDBACK_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.toLowerCase()}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs">
          Type
          <select
            className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
            value={filters.feedbackType}
            onChange={(event) => setFilters((current) => ({ ...current, feedbackType: event.target.value }))}
          >
            <option value="ALL">All types</option>
            {FEEDBACK_TYPES.map((value) => (
              <option key={value} value={value}>
                {feedbackTypeLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs">
          Feature area
          <select
            className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
            value={filters.featureArea}
            onChange={(event) => setFilters((current) => ({ ...current, featureArea: event.target.value }))}
          >
            <option value="ALL">All areas</option>
            {FEEDBACK_FEATURE_AREAS.map((value) => (
              <option key={value} value={value}>
                {feedbackFeatureAreaLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs">
          Mirror
          <select
            className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
            value={filters.mirrorStatus}
            onChange={(event) => setFilters((current) => ({ ...current, mirrorStatus: event.target.value }))}
          >
            <option value="ALL">All mirror states</option>
            {FEEDBACK_MIRROR_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.toLowerCase()}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs">
          Search
          <input
            className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
            placeholder="Email or text"
            value={filters.q}
            onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
          />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button className="rounded-lg border px-3 py-2 text-sm" disabled={loading} onClick={() => void loadFeedback(page)}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {statusMessage ? <p className="mt-3 text-sm text-[var(--muted)]">{statusMessage}</p> : null}

      <div className="mt-4 space-y-3">
        {rows.length === 0 ? <p className="text-sm text-[var(--muted)]">No feedback found for current filters.</p> : null}

        {rows.map((row) => {
          const draftStatus = statusDrafts[row.id] || row.status;
          const isDirty = draftStatus !== row.status;
          const retryableMirror = row.mirrorStatus === "FAILED" || row.mirrorStatus === "PENDING";

          return (
            <article key={row.id} className="rounded-xl border p-3 sm:p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className={`badge ${row.status.toLowerCase()}`}>{row.status.toLowerCase()}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5">{row.feedbackTypeLabel}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5">{row.featureAreaLabel}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5">mirror: {row.mirrorStatus.toLowerCase()}</span>
                <span className="text-[var(--muted)]">{new Date(row.createdAt).toLocaleString()}</span>
              </div>

              <p className="text-sm">{row.message}</p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                User: {row.userEmail} · Source: {row.sourcePath || "unknown"}
              </p>
              {!row.allowEmailContact ? (
                <p className="mt-1 text-xs text-[#8d231f]">Do not contact this user by email for this submission.</p>
              ) : null}

              {row.mirrorIssueUrl ? (
                <p className="mt-1 text-xs">
                  GitHub issue:{" "}
                  <a className="underline" href={row.mirrorIssueUrl} target="_blank" rel="noreferrer">
                    #{row.mirrorIssueNumber}
                  </a>
                </p>
              ) : null}
              {row.mirrorErrorMessage ? <p className="mt-1 text-xs text-[#8d231f]">{row.mirrorErrorMessage}</p> : null}

              <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
                <select
                  className="rounded-lg border px-2 py-2 text-sm"
                  value={draftStatus}
                  onChange={(event) =>
                    setStatusDrafts((current) => ({
                      ...current,
                      [row.id]: event.target.value
                    }))
                  }
                >
                  {FEEDBACK_STATUSES.map((value) => (
                    <option key={`${row.id}-${value}`} value={value}>
                      {value.toLowerCase()}
                    </option>
                  ))}
                </select>
                <button
                  className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={!isDirty || savingFeedbackId === row.id}
                  onClick={() => void saveStatus(row)}
                >
                  {savingFeedbackId === row.id ? "Saving..." : "Save status"}
                </button>
                <button
                  className="rounded-lg border px-3 py-2 text-sm disabled:opacity-60"
                  disabled={!retryableMirror || mirroringFeedbackId === row.id}
                  onClick={() => void retryMirror(row)}
                >
                  {mirroringFeedbackId === row.id ? "Retrying..." : "Retry mirror"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <p>
          Page {pagination.page} of {pagination.totalPages} ({pagination.totalRows} total)
        </p>
        <div className="flex gap-2">
          <button
            className="rounded border px-3 py-1 disabled:opacity-50"
            disabled={loading || pagination.page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Prev
          </button>
          <button
            className="rounded border px-3 py-1 disabled:opacity-50"
            disabled={loading || pagination.page >= pagination.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
