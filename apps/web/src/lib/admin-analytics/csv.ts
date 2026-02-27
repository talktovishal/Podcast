import type {
  AdminAnalyticsSummary,
  AdminAnalyticsTimeseries,
  AdminAnalyticsUsers
} from "./types";

function escapeCsvValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  if (text.includes(",") || text.includes("\n") || text.includes("\"")) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}

function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const lines = [headers.map((header) => escapeCsvValue(header)).join(",")];
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvValue(cell)).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function summaryToCsv(summary: AdminAnalyticsSummary): string {
  const rows: Array<Array<string | number>> = [
    ["acquisition.new_signups", summary.acquisition.newSignups],
    ["acquisition.cumulative_users", summary.acquisition.cumulativeUsers],
    ["acquisition.signup_growth_rate_pct", summary.acquisition.signupGrowthRate],
    ["activation.activation_rate_7d_pct", summary.activation.activationRate7d],
    ["activation.median_time_to_first_ready_ms", summary.activation.medianTimeToFirstReadyMs],
    ["activation.first_submission_24h_rate_pct", summary.activation.firstSubmission24hRate],
    ["engagement.dau", summary.engagement.dau],
    ["engagement.wau", summary.engagement.wau],
    ["engagement.mau", summary.engagement.mau],
    ["engagement.stickiness_dau_mau_pct", summary.engagement.stickinessDauMau],
    ["engagement.submissions_per_active_user", summary.engagement.submissionsPerActiveUser],
    ["engagement.playback_starts", summary.engagement.playbackStarts],
    ["funnel.submitted_items", summary.funnel.submittedItems],
    ["funnel.ready_items", summary.funnel.readyItems],
    ["funnel.failed_items", summary.funnel.failedItems],
    ["funnel.ready_rate_pct", summary.funnel.readyRate],
    ["funnel.failure_rate_pct", summary.funnel.failureRate],
    ["funnel.median_queue_wait_ms", summary.funnel.medianQueueWaitMs],
    ["funnel.median_processing_ms", summary.funnel.medianProcessingMs],
    ["funnel.queued_jobs", summary.funnel.queuedJobs],
    ["funnel.processing_jobs", summary.funnel.processingJobs],
    ["funnel.retryable_failed_jobs", summary.funnel.retryableFailedJobs],
    ["investor.power_users_30d", summary.investor.powerUsers30d],
    ["investor.at_risk_users_14d", summary.investor.atRiskUsers14d]
  ];

  for (const topError of summary.funnel.topErrorCodes) {
    rows.push([`funnel.top_error.${topError.code}`, topError.count]);
  }

  return toCsv(["metric", "value"], rows);
}

export function timeseriesToCsv(timeseries: AdminAnalyticsTimeseries): string {
  return toCsv(
    [
      "day",
      "signups",
      "submissions",
      "ready",
      "failed",
      "playback_starts",
      "daily_active_users",
      "rolling_mau",
      "ready_rate_pct"
    ],
    timeseries.points.map((point) => [
      point.day,
      point.signups,
      point.submissions,
      point.ready,
      point.failed,
      point.playbackStarts,
      point.dailyActiveUsers,
      point.rollingMau,
      point.readyRate
    ])
  );
}

export function usersToCsv(users: AdminAnalyticsUsers): string {
  return toCsv(
    [
      "user_id",
      "email",
      "role",
      "auth_profile",
      "created_at",
      "last_active_at",
      "signups",
      "logins",
      "submissions",
      "ready",
      "failed",
      "playback_starts"
    ],
    users.rows.map((row) => [
      row.userId,
      row.email,
      row.role,
      row.authProfile,
      row.createdAt,
      row.lastActiveAt,
      row.signups,
      row.logins,
      row.submissions,
      row.ready,
      row.failed,
      row.playbackStarts
    ])
  );
}
