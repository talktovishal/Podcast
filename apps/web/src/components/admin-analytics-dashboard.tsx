"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AdminAnalyticsFilterAuth,
  AdminAnalyticsFilterRole,
  AdminAnalyticsFilterSource,
  AdminAnalyticsRetention,
  AdminAnalyticsSummary,
  AdminAnalyticsTimeseries,
  AdminAnalyticsUsers
} from "@/lib/admin-analytics/types";

type TabId = "investor" | "growth" | "engagement" | "reliability" | "users";
type Preset = "7d" | "30d" | "90d" | "custom";

type FilterState = {
  preset: Preset;
  from: string;
  to: string;
  source: AdminAnalyticsFilterSource;
  auth: AdminAnalyticsFilterAuth;
  role: AdminAnalyticsFilterRole;
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  return isoDay(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

function defaultFilters(): FilterState {
  return {
    preset: "30d",
    from: daysAgo(29),
    to: isoDay(new Date()),
    source: "ALL",
    auth: "ALL",
    role: "ALL"
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remSeconds}s`;
}

function buildQuery(filters: FilterState, extras?: Record<string, string | number | boolean>): string {
  const query = new URLSearchParams({
    preset: filters.preset,
    source: filters.source,
    auth: filters.auth,
    role: filters.role
  });

  if (filters.preset === "custom") {
    query.set("from", `${filters.from}T00:00:00.000Z`);
    query.set("to", `${filters.to}T23:59:59.999Z`);
  }

  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      query.set(key, String(value));
    }
  }

  return query.toString();
}

function coverageBadge(summary: AdminAnalyticsSummary | null): string {
  if (!summary || summary.coverage.length === 0) {
    return "Coverage metadata unavailable";
  }
  const playbackCoverage = summary.coverage.find((entry) => entry.metricKey === "playback_starts");
  if (!playbackCoverage) {
    return "Coverage metadata available";
  }
  if (playbackCoverage.notes?.trim()) {
    return playbackCoverage.notes;
  }
  if (playbackCoverage.isBackfilled) {
    return "Playback metrics include historical backfill";
  }
  return `Playback starts forward-only since ${new Date(playbackCoverage.coverageStartAt).toLocaleDateString()}`;
}

export function AdminAnalyticsDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("investor");
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [summary, setSummary] = useState<AdminAnalyticsSummary | null>(null);
  const [timeseries, setTimeseries] = useState<AdminAnalyticsTimeseries | null>(null);
  const [retention, setRetention] = useState<AdminAnalyticsRetention | null>(null);
  const [users, setUsers] = useState<AdminAnalyticsUsers | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const [revealPii, setRevealPii] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (filters.preset === "custom") {
      return;
    }
    const now = new Date();
    const totalDays = filters.preset === "7d" ? 7 : filters.preset === "90d" ? 90 : 30;
    setFilters((current) => ({
      ...current,
      from: isoDay(new Date(now.getTime() - (totalDays - 1) * 24 * 60 * 60 * 1000)),
      to: isoDay(now)
    }));
  }, [filters.preset]);

  useEffect(() => {
    setUsersPage(1);
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    async function run() {
      setLoading(true);
      setError(null);
      const query = buildQuery(filters);
      try {
        const [summaryResponse, timeseriesResponse, retentionResponse] = await Promise.all([
          fetch(`/api/admin/analytics/summary?${query}`, { cache: "no-store", signal: controller.signal }),
          fetch(`/api/admin/analytics/timeseries?${query}`, { cache: "no-store", signal: controller.signal }),
          fetch(`/api/admin/analytics/retention?${query}`, { cache: "no-store", signal: controller.signal })
        ]);

        if (!summaryResponse.ok || !timeseriesResponse.ok || !retentionResponse.ok) {
          throw new Error("Unable to load analytics data.");
        }

        const [summaryPayload, timeseriesPayload, retentionPayload] = await Promise.all([
          summaryResponse.json() as Promise<{ summary: AdminAnalyticsSummary }>,
          timeseriesResponse.json() as Promise<{ timeseries: AdminAnalyticsTimeseries }>,
          retentionResponse.json() as Promise<{ retention: AdminAnalyticsRetention }>
        ]);

        setSummary(summaryPayload.summary);
        setTimeseries(timeseriesPayload.timeseries);
        setRetention(retentionPayload.retention);
      } catch (cause) {
        if (controller.signal.aborted) {
          return;
        }
        setError(cause instanceof Error ? cause.message : "Unable to load analytics data.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }
    void run();

    return () => {
      controller.abort();
    };
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    async function run() {
      setUsersLoading(true);
      const query = buildQuery(filters, {
        page: usersPage,
        page_size: 25,
        pii: revealPii ? 1 : 0
      });
      try {
        const response = await fetch(`/api/admin/analytics/users?${query}`, {
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error("Unable to load user analytics.");
        }
        const payload = (await response.json()) as { users: AdminAnalyticsUsers };
        setUsers(payload.users);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Unable to load user analytics.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setUsersLoading(false);
        }
      }
    }
    void run();

    return () => {
      controller.abort();
    };
  }, [filters, usersPage, revealPii]);

  const tabDataset = useMemo(() => {
    if (activeTab === "users") {
      return "users";
    }
    if (activeTab === "engagement") {
      return "timeseries";
    }
    return "summary";
  }, [activeTab]);

  const handleExport = () => {
    const query = buildQuery(filters, {
      dataset: tabDataset,
      page: usersPage,
      page_size: 25,
      pii: revealPii ? 1 : 0
    });
    window.location.href = `/api/admin/analytics/export?${query}`;
  };

  return (
    <section className="space-y-4">
      <article className="card p-4">
        <div className="grid gap-3 lg:grid-cols-6">
          <label className="flex flex-col gap-1 text-xs">
            Time window
            <select
              className="rounded-md border px-2 py-2 text-sm"
              value={filters.preset}
              onChange={(event) => setFilters((current) => ({ ...current, preset: event.target.value as Preset }))}
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            From
            <input
              type="date"
              className="rounded-md border px-2 py-2 text-sm"
              value={filters.from}
              disabled={filters.preset !== "custom"}
              onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs">
            To
            <input
              type="date"
              className="rounded-md border px-2 py-2 text-sm"
              value={filters.to}
              disabled={filters.preset !== "custom"}
              onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs">
            Source
            <select
              className="rounded-md border px-2 py-2 text-sm"
              value={filters.source}
              onChange={(event) =>
                setFilters((current) => ({ ...current, source: event.target.value as AdminAnalyticsFilterSource }))
              }
            >
              <option value="ALL">All sources</option>
              <option value="URL">URL</option>
              <option value="PDF">PDF</option>
              <option value="HTML_SNAPSHOT">HTML snapshot</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            Auth
            <select
              className="rounded-md border px-2 py-2 text-sm"
              value={filters.auth}
              onChange={(event) =>
                setFilters((current) => ({ ...current, auth: event.target.value as AdminAnalyticsFilterAuth }))
              }
            >
              <option value="ALL">All auth profiles</option>
              <option value="LOCAL">Local only</option>
              <option value="OAUTH_LINKED">OAuth linked</option>
              <option value="GOOGLE">Google</option>
              <option value="APPLE">Apple</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            Role
            <select
              className="rounded-md border px-2 py-2 text-sm"
              value={filters.role}
              onChange={(event) =>
                setFilters((current) => ({ ...current, role: event.target.value as AdminAnalyticsFilterRole }))
              }
            >
              <option value="ALL">All roles</option>
              <option value="USER">Users</option>
              <option value="ADMIN">Admins</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--muted)]">{coverageBadge(summary)}</p>
          <button className="rounded-lg border px-3 py-2 text-sm font-medium" type="button" onClick={handleExport}>
            Export CSV
          </button>
        </div>
      </article>

      <article className="card p-2">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["investor", "Investor Summary"],
            ["growth", "Growth & Activation"],
            ["engagement", "Engagement & Retention"],
            ["reliability", "Reliability"],
            ["users", "Users"]
          ].map(([id, label]) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                className={`rounded-lg border px-3 py-2 text-sm ${selected ? "bg-[var(--accent)] text-white" : ""}`}
                onClick={() => setActiveTab(id as TabId)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </article>

      {error ? (
        <article className="card border border-[var(--danger)] p-4 text-sm text-[var(--danger)]">{error}</article>
      ) : null}
      {loading ? <article className="card p-4 text-sm text-[var(--muted)]">Loading analytics…</article> : null}

      {!loading && summary ? (
        <>
          {activeTab === "investor" ? (
            <section className="grid gap-4 md:grid-cols-3">
              <article className="card p-4">
                <p className="text-xs text-[var(--muted)]">New signups</p>
                <p className="mt-1 text-3xl font-semibold">{summary.acquisition.newSignups}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Growth {summary.acquisition.signupGrowthRate}% vs previous period</p>
              </article>
              <article className="card p-4">
                <p className="text-xs text-[var(--muted)]">Monthly active users</p>
                <p className="mt-1 text-3xl font-semibold">{summary.engagement.mau}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Stickiness {summary.engagement.stickinessDauMau}%</p>
              </article>
              <article className="card p-4">
                <p className="text-xs text-[var(--muted)]">Ready episodes</p>
                <p className="mt-1 text-3xl font-semibold">{summary.funnel.readyItems}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Ready rate {summary.funnel.readyRate}%</p>
              </article>
              <article className="card p-4">
                <p className="text-xs text-[var(--muted)]">Activation (7d)</p>
                <p className="mt-1 text-3xl font-semibold">{summary.activation.activationRate7d}%</p>
              </article>
              <article className="card p-4">
                <p className="text-xs text-[var(--muted)]">Power users (30d)</p>
                <p className="mt-1 text-3xl font-semibold">{summary.investor.powerUsers30d}</p>
              </article>
              <article className="card p-4">
                <p className="text-xs text-[var(--muted)]">At-risk users (14d)</p>
                <p className="mt-1 text-3xl font-semibold">{summary.investor.atRiskUsers14d}</p>
              </article>
            </section>
          ) : null}

          {activeTab === "growth" ? (
            <section className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <article className="card p-4">
                  <p className="text-xs text-[var(--muted)]">Cumulative users</p>
                  <p className="mt-1 text-3xl font-semibold">{summary.acquisition.cumulativeUsers}</p>
                </article>
                <article className="card p-4">
                  <p className="text-xs text-[var(--muted)]">Median time to first ready</p>
                  <p className="mt-1 text-3xl font-semibold">{formatDuration(summary.activation.medianTimeToFirstReadyMs)}</p>
                </article>
                <article className="card p-4">
                  <p className="text-xs text-[var(--muted)]">First submission in 24h</p>
                  <p className="mt-1 text-3xl font-semibold">{summary.activation.firstSubmission24hRate}%</p>
                </article>
              </div>
              <article className="card overflow-x-auto p-4">
                <h3 className="mb-3 text-sm font-semibold">Daily growth trend</h3>
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="text-[var(--muted)]">
                      <th className="px-2 py-1">Day</th>
                      <th className="px-2 py-1">Signups</th>
                      <th className="px-2 py-1">Submissions</th>
                      <th className="px-2 py-1">Ready</th>
                      <th className="px-2 py-1">Ready rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeseries?.points.slice(-14).map((point) => (
                      <tr key={point.day}>
                        <td className="px-2 py-1">{point.day}</td>
                        <td className="px-2 py-1">{point.signups}</td>
                        <td className="px-2 py-1">{point.submissions}</td>
                        <td className="px-2 py-1">{point.ready}</td>
                        <td className="px-2 py-1">{point.readyRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            </section>
          ) : null}

          {activeTab === "engagement" ? (
            <section className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <article className="card p-4">
                  <p className="text-xs text-[var(--muted)]">DAU / WAU / MAU</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {summary.engagement.dau} / {summary.engagement.wau} / {summary.engagement.mau}
                  </p>
                </article>
                <article className="card p-4">
                  <p className="text-xs text-[var(--muted)]">Playback starts</p>
                  <p className="mt-1 text-3xl font-semibold">{summary.engagement.playbackStarts}</p>
                </article>
                <article className="card p-4">
                  <p className="text-xs text-[var(--muted)]">Submissions per active user</p>
                  <p className="mt-1 text-3xl font-semibold">{summary.engagement.submissionsPerActiveUser}</p>
                </article>
              </div>

              <article className="card overflow-x-auto p-4">
                <h3 className="mb-3 text-sm font-semibold">Retention cohorts</h3>
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="text-[var(--muted)]">
                      <th className="px-2 py-1">Cohort week</th>
                      <th className="px-2 py-1">Size</th>
                      <th className="px-2 py-1">D1</th>
                      <th className="px-2 py-1">D7</th>
                      <th className="px-2 py-1">D30</th>
                      <th className="px-2 py-1">W1</th>
                      <th className="px-2 py-1">W2</th>
                      <th className="px-2 py-1">W4</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retention?.rows.map((row) => (
                      <tr key={row.cohortWeekStart}>
                        <td className="px-2 py-1">{row.cohortWeekStart}</td>
                        <td className="px-2 py-1">{row.cohortSize}</td>
                        <td className="px-2 py-1">{row.d1}%</td>
                        <td className="px-2 py-1">{row.d7}%</td>
                        <td className="px-2 py-1">{row.d30}%</td>
                        <td className="px-2 py-1">{row.w1}%</td>
                        <td className="px-2 py-1">{row.w2}%</td>
                        <td className="px-2 py-1">{row.w4}%</td>
                      </tr>
                    ))}
                    {retention && retention.rows.length === 0 ? (
                      <tr>
                        <td className="px-2 py-2 text-[var(--muted)]" colSpan={8}>
                          No cohorts found in this range.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </article>
            </section>
          ) : null}

          {activeTab === "reliability" ? (
            <section className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <article className="card p-4">
                  <p className="text-xs text-[var(--muted)]">Queue health</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {summary.funnel.queuedJobs} queued / {summary.funnel.processingJobs} processing
                  </p>
                </article>
                <article className="card p-4">
                  <p className="text-xs text-[var(--muted)]">Retryable failed jobs</p>
                  <p className="mt-1 text-3xl font-semibold">{summary.funnel.retryableFailedJobs}</p>
                </article>
                <article className="card p-4">
                  <p className="text-xs text-[var(--muted)]">Median latencies</p>
                  <p className="mt-1 text-sm font-semibold">
                    Queue wait {formatDuration(summary.funnel.medianQueueWaitMs)}
                    <br />
                    Processing {formatDuration(summary.funnel.medianProcessingMs)}
                  </p>
                </article>
              </div>
              <article className="card p-4">
                <h3 className="mb-2 text-sm font-semibold">Top error codes</h3>
                <div className="space-y-1 text-sm">
                  {summary.funnel.topErrorCodes.length === 0 ? (
                    <p className="text-[var(--muted)]">No recent errors</p>
                  ) : (
                    summary.funnel.topErrorCodes.map((entry) => (
                      <p key={entry.code}>
                        {entry.code}: {entry.count}
                      </p>
                    ))
                  )}
                </div>
              </article>
            </section>
          ) : null}

          {activeTab === "users" ? (
            <section className="space-y-4">
              <article className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-sm text-[var(--muted)]">PII is masked by default for investor-safe screens.</p>
                <button
                  type="button"
                  className="rounded-lg border px-3 py-2 text-sm"
                  onClick={() => setRevealPii((current) => !current)}
                >
                  {revealPii ? "Mask PII" : "Reveal PII"}
                </button>
              </article>

              <article className="card overflow-x-auto p-4">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="text-[var(--muted)]">
                      <th className="px-2 py-1">User</th>
                      <th className="px-2 py-1">Role</th>
                      <th className="px-2 py-1">Auth profile</th>
                      <th className="px-2 py-1">Country</th>
                      <th className="px-2 py-1">Region</th>
                      <th className="px-2 py-1">City</th>
                      <th className="px-2 py-1">Age band</th>
                      <th className="px-2 py-1">Gender</th>
                      <th className="px-2 py-1">Created</th>
                      <th className="px-2 py-1">Last active</th>
                      <th className="px-2 py-1">Logins</th>
                      <th className="px-2 py-1">Submissions</th>
                      <th className="px-2 py-1">Ready</th>
                      <th className="px-2 py-1">Failed</th>
                      <th className="px-2 py-1">Playback starts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users?.rows.map((row) => (
                      <tr key={row.userId}>
                        <td className="px-2 py-1">{row.email}</td>
                        <td className="px-2 py-1">{row.role}</td>
                        <td className="px-2 py-1">{row.authProfile}</td>
                        <td className="px-2 py-1">{row.firstSeenCountryCode || "—"}</td>
                        <td className="px-2 py-1">{row.firstSeenRegionCode || "—"}</td>
                        <td className="px-2 py-1">{row.firstSeenCity || "—"}</td>
                        <td className="px-2 py-1">{row.ageBand || "—"}</td>
                        <td className="px-2 py-1">{row.genderIdentity || "—"}</td>
                        <td className="px-2 py-1">{new Date(row.createdAt).toLocaleDateString()}</td>
                        <td className="px-2 py-1">{row.lastActiveAt ? new Date(row.lastActiveAt).toLocaleString() : "—"}</td>
                        <td className="px-2 py-1">{row.logins}</td>
                        <td className="px-2 py-1">{row.submissions}</td>
                        <td className="px-2 py-1">{row.ready}</td>
                        <td className="px-2 py-1">{row.failed}</td>
                        <td className="px-2 py-1">{row.playbackStarts}</td>
                      </tr>
                    ))}
                    {users && users.rows.length === 0 ? (
                      <tr>
                        <td className="px-2 py-2 text-[var(--muted)]" colSpan={15}>
                          No users match this filter.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </article>

              <article className="card flex items-center justify-between p-3 text-sm">
                <p>
                  {users
                    ? `Page ${users.pagination.page} of ${users.pagination.totalPages} (${users.pagination.totalRows} users)`
                    : "No user rows"}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded border px-3 py-1 disabled:opacity-50"
                    disabled={usersLoading || !users || users.pagination.page <= 1}
                    onClick={() => setUsersPage((current) => Math.max(1, current - 1))}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="rounded border px-3 py-1 disabled:opacity-50"
                    disabled={usersLoading || !users || users.pagination.page >= users.pagination.totalPages}
                    onClick={() => setUsersPage((current) => current + 1)}
                  >
                    Next
                  </button>
                </div>
              </article>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
