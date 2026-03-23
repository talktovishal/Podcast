import type { Prisma } from "@prisma/client";
import type {
  AdminAnalyticsCoverage,
  AdminAnalyticsFilters,
  AdminAnalyticsRetention,
  AdminAnalyticsRetentionRow,
  AdminAnalyticsSummary,
  AdminAnalyticsTimeseries,
  AdminAnalyticsTimeseriesPoint,
  AdminAnalyticsUsers
} from "./types";
import {
  getAzurePrimaryAdminAnalyticsRetention,
  getAzurePrimaryAdminAnalyticsSummary,
  getAzurePrimaryAdminAnalyticsTimeseries,
  getAzurePrimaryAdminAnalyticsUsers
} from "./azure-primary";
import { webUsesAzureTablePrimary } from "@/lib/metadata-primary-store";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const meaningfulEventTypes = ["USER_LOGIN", "ITEM_SUBMITTED", "ITEM_READY", "PLAYBACK_STARTED"] as const;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function startOfUtcWeek(date: Date): Date {
  const day = date.getUTCDay();
  const shift = day === 0 ? -6 : 1 - day;
  return startOfUtcDay(addDays(date, shift));
}

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatPct(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return formatPct((numerator / denominator) * 100);
}

function maskEmail(email: string): string {
  const [local, domain = ""] = email.split("@");
  if (!local) {
    return "***";
  }
  const visiblePrefix = local.length <= 2 ? local[0] ?? "*" : local.slice(0, 2);
  return `${visiblePrefix}${"*".repeat(Math.max(1, local.length - visiblePrefix.length))}@${domain}`;
}

function authWhereClause(auth: AdminAnalyticsFilters["auth"]): Prisma.AnalyticsEventWhereInput {
  if (auth === "ALL") {
    return {};
  }
  if (auth === "OAUTH_LINKED") {
    return { segmentAuth: "OAUTH_LINKED" };
  }
  return { authMethod: auth };
}

function authWhereClauseForUsers(auth: AdminAnalyticsFilters["auth"]): Prisma.UserWhereInput {
  if (auth === "ALL") {
    return {};
  }
  if (auth === "LOCAL") {
    return { oauthIdentities: { none: {} } };
  }
  if (auth === "OAUTH_LINKED") {
    return { oauthIdentities: { some: {} } };
  }
  if (auth === "GOOGLE") {
    return { oauthIdentities: { some: { provider: "google" } } };
  }
  if (auth === "FACEBOOK") {
    return { oauthIdentities: { some: { provider: "facebook" } } };
  }
  return { oauthIdentities: { some: { provider: "apple" } } };
}

function buildEventWhere(filters: AdminAnalyticsFilters, eventTypes?: string[]): Prisma.AnalyticsEventWhereInput {
  const where: Prisma.AnalyticsEventWhereInput = {
    occurredAt: { gte: filters.from, lte: filters.to },
    ...(eventTypes ? { eventType: { in: eventTypes } } : {})
  };

  if (filters.source !== "ALL") {
    where.sourceType = filters.source;
  }
  if (filters.role !== "ALL") {
    where.userRole = filters.role;
  }

  Object.assign(where, authWhereClause(filters.auth));
  return where;
}

function buildUserWhere(filters: AdminAnalyticsFilters): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    createdAt: {
      gte: filters.from,
      lte: filters.to
    }
  };

  if (filters.role !== "ALL") {
    where.role = filters.role;
  }
  Object.assign(where, authWhereClauseForUsers(filters.auth));
  return where;
}

async function countDistinctUsers(where: Prisma.AnalyticsEventWhereInput): Promise<number> {
  const rows = await prisma.analyticsEvent.findMany({
    where: {
      ...where,
      userId: { not: null }
    },
    select: { userId: true },
    distinct: ["userId"]
  });
  return rows.length;
}

async function loadCoverage(): Promise<AdminAnalyticsCoverage[]> {
  const rows = await prisma.analyticsCoverage.findMany({
    orderBy: [{ metricKey: "asc" }]
  });
  return rows.map((row) => ({
    metricKey: row.metricKey,
    coverageStartAt: row.coverageStartAt.toISOString(),
    isBackfilled: row.isBackfilled,
    notes: row.notes ?? null
  }));
}

async function firstEventByUser(input: {
  eventType: string;
  userIds: string[];
  filters: AdminAnalyticsFilters;
}): Promise<Map<string, Date>> {
  if (input.userIds.length === 0) {
    return new Map();
  }
  const events = await prisma.analyticsEvent.findMany({
    where: {
      eventType: input.eventType,
      userId: { in: input.userIds },
      occurredAt: {
        gte: input.filters.from,
        lte: addDays(input.filters.to, 8)
      },
      ...(input.filters.source !== "ALL" ? { sourceType: input.filters.source } : {}),
      ...(input.filters.role !== "ALL" ? { userRole: input.filters.role } : {}),
      ...authWhereClause(input.filters.auth)
    },
    orderBy: [{ occurredAt: "asc" }],
    select: {
      userId: true,
      occurredAt: true
    }
  });

  const map = new Map<string, Date>();
  for (const event of events) {
    if (!event.userId || map.has(event.userId)) {
      continue;
    }
    map.set(event.userId, event.occurredAt);
  }
  return map;
}

export async function getAdminAnalyticsSummary(filters: AdminAnalyticsFilters): Promise<AdminAnalyticsSummary> {
  if (webUsesAzureTablePrimary()) {
    return getAzurePrimaryAdminAnalyticsSummary(filters);
  }

  const previousWindowDays = Math.max(1, Math.ceil((filters.to.getTime() - filters.from.getTime() + 1) / DAY_MS));
  const prevTo = new Date(filters.from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - previousWindowDays * DAY_MS + 1);

  const [newSignups, previousSignups, cumulativeUsers, eventCounts, coverage, userSignups, queueCounts, topErrorEvents] =
    await Promise.all([
      prisma.user.count({ where: buildUserWhere(filters) }),
      prisma.user.count({
        where: {
          ...buildUserWhere(filters),
          createdAt: {
            gte: prevFrom,
            lte: prevTo
          }
        }
      }),
      prisma.user.count({
        where: {
          createdAt: { lte: filters.to },
          ...(filters.role !== "ALL" ? { role: filters.role } : {}),
          ...authWhereClauseForUsers(filters.auth)
        }
      }),
      prisma.analyticsEvent.groupBy({
        by: ["eventType"],
        where: buildEventWhere(filters, [
          "ITEM_SUBMITTED",
          "ITEM_READY",
          "ITEM_FAILED",
          "PLAYBACK_STARTED"
        ]),
        _count: {
          _all: true
        }
      }),
      loadCoverage(),
      prisma.user.findMany({
        where: buildUserWhere(filters),
        select: {
          id: true,
          createdAt: true
        }
      }),
      Promise.all([
        prisma.job.count({ where: { status: "QUEUED" } }),
        prisma.job.count({ where: { status: "PROCESSING" } }),
        prisma.job.count({
          where: {
            status: "FAILED",
            nextRetryAt: { lte: new Date() }
          }
        })
      ]),
      prisma.jobEvent.findMany({
        where: { eventType: "error" },
        orderBy: { createdAt: "desc" },
        take: 100
      })
    ]);

  const counts = new Map<string, number>();
  for (const row of eventCounts) {
    counts.set(row.eventType, row._count._all);
  }
  const submittedItems = counts.get("ITEM_SUBMITTED") ?? 0;
  const readyItems = counts.get("ITEM_READY") ?? 0;
  const failedItems = counts.get("ITEM_FAILED") ?? 0;
  const playbackStarts = counts.get("PLAYBACK_STARTED") ?? 0;

  const userIds = userSignups.map((user) => user.id);
  const [firstReadyByUser, firstSubmissionByUser, activeInRange, dau, wau, mau, powerUsers, recentActiveUsers, olderActiveUsers, durationEvents] =
    await Promise.all([
      firstEventByUser({ eventType: "ITEM_READY", userIds, filters }),
      firstEventByUser({ eventType: "ITEM_SUBMITTED", userIds, filters }),
      countDistinctUsers(buildEventWhere(filters, [...meaningfulEventTypes])),
      countDistinctUsers({
        ...buildEventWhere(filters, [...meaningfulEventTypes]),
        occurredAt: {
          gte: startOfUtcDay(filters.to),
          lte: endOfUtcDay(filters.to)
        }
      }),
      countDistinctUsers({
        ...buildEventWhere(filters, [...meaningfulEventTypes]),
        occurredAt: {
          gte: startOfUtcDay(addDays(filters.to, -6)),
          lte: endOfUtcDay(filters.to)
        }
      }),
      countDistinctUsers({
        ...buildEventWhere(filters, [...meaningfulEventTypes]),
        occurredAt: {
          gte: startOfUtcDay(addDays(filters.to, -29)),
          lte: endOfUtcDay(filters.to)
        }
      }),
      prisma.analyticsEvent.groupBy({
        by: ["userId"],
        where: {
          ...buildEventWhere(
            {
              ...filters,
              from: startOfUtcDay(addDays(filters.to, -29)),
              to: endOfUtcDay(filters.to)
            },
            ["ITEM_READY"]
          ),
          userId: { not: null }
        },
        _count: {
          _all: true
        }
      }),
      prisma.analyticsEvent.findMany({
        where: {
          ...buildEventWhere(
            {
              ...filters,
              from: startOfUtcDay(addDays(filters.to, -13)),
              to: endOfUtcDay(filters.to)
            },
            [...meaningfulEventTypes]
          ),
          userId: { not: null }
        },
        select: { userId: true },
        distinct: ["userId"]
      }),
      prisma.analyticsEvent.findMany({
        where: {
          ...buildEventWhere(
            {
              ...filters,
              from: startOfUtcDay(addDays(filters.to, -43)),
              to: endOfUtcDay(addDays(filters.to, -14))
            },
            [...meaningfulEventTypes]
          ),
          userId: { not: null }
        },
        select: { userId: true },
        distinct: ["userId"]
      }),
      prisma.analyticsEvent.findMany({
        where: buildEventWhere(filters, ["ITEM_READY", "ITEM_FAILED"]),
        select: {
          metadataJson: true
        }
      })
    ]);

  const activationDurations: number[] = [];
  let activatedUsers = 0;
  let submitted24h = 0;
  for (const user of userSignups) {
    const firstReady = firstReadyByUser.get(user.id);
    if (firstReady) {
      const delta = firstReady.getTime() - user.createdAt.getTime();
      if (delta >= 0) {
        activationDurations.push(delta);
      }
      if (delta >= 0 && delta <= 7 * DAY_MS) {
        activatedUsers += 1;
      }
    }

    const firstSubmit = firstSubmissionByUser.get(user.id);
    if (firstSubmit) {
      const delta = firstSubmit.getTime() - user.createdAt.getTime();
      if (delta >= 0 && delta <= DAY_MS) {
        submitted24h += 1;
      }
    }
  }

  const queueDurations: number[] = [];
  const processingDurations: number[] = [];
  for (const row of durationEvents) {
    const payload = row.metadataJson as Record<string, unknown> | null;
    const queueWaitMs = Number(payload?.queue_wait_ms ?? NaN);
    const processingMs = Number(payload?.processing_duration_ms ?? NaN);
    if (Number.isFinite(queueWaitMs) && queueWaitMs >= 0) {
      queueDurations.push(Math.round(queueWaitMs));
    }
    if (Number.isFinite(processingMs) && processingMs >= 0) {
      processingDurations.push(Math.round(processingMs));
    }
  }

  const errorCodeCounts = new Map<string, number>();
  for (const event of topErrorEvents) {
    const payload = event.payloadJson as Record<string, unknown> | null;
    const candidate = payload?.error_code ?? payload?.errorCode ?? payload?.code;
    const code = typeof candidate === "string" && candidate.trim() ? candidate.trim() : "UNKNOWN";
    errorCodeCounts.set(code, (errorCodeCounts.get(code) ?? 0) + 1);
  }

  const powerUsers30d = powerUsers.filter((row) => row.userId && row._count._all >= 3).length;
  const recentActiveSet = new Set(recentActiveUsers.map((row) => row.userId).filter((id): id is string => Boolean(id)));
  const olderActiveSet = new Set(olderActiveUsers.map((row) => row.userId).filter((id): id is string => Boolean(id)));
  let atRiskUsers14d = 0;
  for (const userId of olderActiveSet) {
    if (!recentActiveSet.has(userId)) {
      atRiskUsers14d += 1;
    }
  }

  return {
    filters: {
      from: filters.from.toISOString(),
      to: filters.to.toISOString(),
      preset: filters.preset,
      source: filters.source,
      auth: filters.auth,
      role: filters.role
    },
    coverage,
    acquisition: {
      newSignups,
      cumulativeUsers,
      signupGrowthRate: previousSignups > 0 ? formatPct(((newSignups - previousSignups) / previousSignups) * 100) : 0
    },
    activation: {
      activationRate7d: rate(activatedUsers, newSignups),
      medianTimeToFirstReadyMs: median(activationDurations),
      firstSubmission24hRate: rate(submitted24h, newSignups)
    },
    engagement: {
      dau,
      wau,
      mau,
      stickinessDauMau: mau > 0 ? formatPct((dau / mau) * 100) : 0,
      submissionsPerActiveUser: activeInRange > 0 ? Math.round((submittedItems / activeInRange) * 100) / 100 : 0,
      playbackStarts
    },
    funnel: {
      submittedItems,
      readyItems,
      failedItems,
      readyRate: rate(readyItems, submittedItems),
      failureRate: rate(failedItems, submittedItems),
      medianQueueWaitMs: median(queueDurations),
      medianProcessingMs: median(processingDurations),
      queuedJobs: queueCounts[0],
      processingJobs: queueCounts[1],
      retryableFailedJobs: queueCounts[2],
      topErrorCodes: Array.from(errorCodeCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([code, count]) => ({ code, count }))
    },
    investor: {
      powerUsers30d,
      atRiskUsers14d
    }
  };
}

export async function getAdminAnalyticsTimeseries(filters: AdminAnalyticsFilters): Promise<AdminAnalyticsTimeseries> {
  if (webUsesAzureTablePrimary()) {
    return getAzurePrimaryAdminAnalyticsTimeseries(filters);
  }

  const coverage = await loadCoverage();
  const events = await prisma.analyticsEvent.findMany({
    where: buildEventWhere(filters, [
      "USER_SIGNUP",
      "ITEM_SUBMITTED",
      "ITEM_READY",
      "ITEM_FAILED",
      "PLAYBACK_STARTED",
      ...meaningfulEventTypes
    ]),
    select: {
      day: true,
      eventType: true,
      userId: true
    },
    orderBy: { day: "asc" }
  });

  const pointsByDay = new Map<
    string,
    {
      signups: number;
      submissions: number;
      ready: number;
      failed: number;
      playbackStarts: number;
      activeUsers: Set<string>;
    }
  >();

  const allDays: string[] = [];
  for (let cursor = startOfUtcDay(filters.from); cursor.getTime() <= filters.to.getTime(); cursor = addDays(cursor, 1)) {
    const day = toIsoDay(cursor);
    allDays.push(day);
    pointsByDay.set(day, {
      signups: 0,
      submissions: 0,
      ready: 0,
      failed: 0,
      playbackStarts: 0,
      activeUsers: new Set<string>()
    });
  }

  for (const event of events) {
    const bucket = pointsByDay.get(event.day);
    if (!bucket) {
      continue;
    }

    if (event.eventType === "USER_SIGNUP") bucket.signups += 1;
    if (event.eventType === "ITEM_SUBMITTED") bucket.submissions += 1;
    if (event.eventType === "ITEM_READY") bucket.ready += 1;
    if (event.eventType === "ITEM_FAILED") bucket.failed += 1;
    if (event.eventType === "PLAYBACK_STARTED") bucket.playbackStarts += 1;
    if (event.userId && meaningfulEventTypes.includes(event.eventType as (typeof meaningfulEventTypes)[number])) {
      bucket.activeUsers.add(event.userId);
    }
  }

  const points: AdminAnalyticsTimeseriesPoint[] = [];
  for (let index = 0; index < allDays.length; index += 1) {
    const day = allDays[index]!;
    const bucket = pointsByDay.get(day)!;
    const windowStart = Math.max(0, index - 29);
    const merged = new Set<string>();
    for (let cursor = windowStart; cursor <= index; cursor += 1) {
      const sourceDay = allDays[cursor]!;
      const sourceBucket = pointsByDay.get(sourceDay)!;
      for (const userId of sourceBucket.activeUsers) {
        merged.add(userId);
      }
    }
    points.push({
      day,
      signups: bucket.signups,
      submissions: bucket.submissions,
      ready: bucket.ready,
      failed: bucket.failed,
      playbackStarts: bucket.playbackStarts,
      dailyActiveUsers: bucket.activeUsers.size,
      rollingMau: merged.size,
      readyRate: rate(bucket.ready, bucket.submissions)
    });
  }

  return {
    filters: {
      from: filters.from.toISOString(),
      to: filters.to.toISOString(),
      preset: filters.preset,
      source: filters.source,
      auth: filters.auth,
      role: filters.role
    },
    points,
    coverage
  };
}

export async function getAdminAnalyticsRetention(filters: AdminAnalyticsFilters): Promise<AdminAnalyticsRetention> {
  if (webUsesAzureTablePrimary()) {
    return getAzurePrimaryAdminAnalyticsRetention(filters);
  }

  const coverage = await loadCoverage();
  const users = await prisma.user.findMany({
    where: buildUserWhere(filters),
    select: {
      id: true,
      createdAt: true
    },
    orderBy: { createdAt: "desc" }
  });

  const userIds = users.map((user) => user.id);
  const activityEvents =
    userIds.length > 0
      ? await prisma.analyticsEvent.findMany({
          where: {
            userId: { in: userIds },
            eventType: { in: [...meaningfulEventTypes] },
            occurredAt: {
              gte: filters.from,
              lte: addDays(filters.to, 40)
            },
            ...(filters.source !== "ALL" ? { sourceType: filters.source } : {}),
            ...(filters.role !== "ALL" ? { userRole: filters.role } : {}),
            ...authWhereClause(filters.auth)
          },
          select: {
            userId: true,
            occurredAt: true
          }
        })
      : [];

  const eventsByUser = new Map<string, Date[]>();
  for (const event of activityEvents) {
    if (!event.userId) {
      continue;
    }
    if (!eventsByUser.has(event.userId)) {
      eventsByUser.set(event.userId, []);
    }
    eventsByUser.get(event.userId)!.push(event.occurredAt);
  }

  type CohortAccumulator = {
    size: number;
    w1: number;
    w2: number;
    w4: number;
    d1: number;
    d7: number;
    d30: number;
  };

  const cohorts = new Map<string, CohortAccumulator>();
  for (const user of users) {
    const signup = user.createdAt;
    const cohortKey = toIsoDay(startOfUtcWeek(signup));
    if (!cohorts.has(cohortKey)) {
      cohorts.set(cohortKey, {
        size: 0,
        w1: 0,
        w2: 0,
        w4: 0,
        d1: 0,
        d7: 0,
        d30: 0
      });
    }

    const row = cohorts.get(cohortKey)!;
    row.size += 1;

    const events = eventsByUser.get(user.id) ?? [];
    let hasW1 = false;
    let hasW2 = false;
    let hasW4 = false;
    let hasD1 = false;
    let hasD7 = false;
    let hasD30 = false;

    for (const when of events) {
      const dayDelta = Math.floor((startOfUtcDay(when).getTime() - startOfUtcDay(signup).getTime()) / DAY_MS);
      if (dayDelta === 1) hasD1 = true;
      if (dayDelta === 7) hasD7 = true;
      if (dayDelta === 30) hasD30 = true;
      if (dayDelta >= 7 && dayDelta < 14) hasW1 = true;
      if (dayDelta >= 14 && dayDelta < 21) hasW2 = true;
      if (dayDelta >= 28 && dayDelta < 35) hasW4 = true;
    }

    if (hasW1) row.w1 += 1;
    if (hasW2) row.w2 += 1;
    if (hasW4) row.w4 += 1;
    if (hasD1) row.d1 += 1;
    if (hasD7) row.d7 += 1;
    if (hasD30) row.d30 += 1;
  }

  const rows: AdminAnalyticsRetentionRow[] = Array.from(cohorts.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([cohortWeekStart, row]) => ({
      cohortWeekStart,
      cohortSize: row.size,
      w1: rate(row.w1, row.size),
      w2: rate(row.w2, row.size),
      w4: rate(row.w4, row.size),
      d1: rate(row.d1, row.size),
      d7: rate(row.d7, row.size),
      d30: rate(row.d30, row.size)
    }));

  return {
    filters: {
      from: filters.from.toISOString(),
      to: filters.to.toISOString(),
      preset: filters.preset,
      source: filters.source,
      auth: filters.auth,
      role: filters.role
    },
    rows,
    coverage
  };
}

export async function getAdminAnalyticsUsers(input: {
  filters: AdminAnalyticsFilters;
  page: number;
  pageSize: number;
  pii: boolean;
}): Promise<AdminAnalyticsUsers> {
  if (webUsesAzureTablePrimary()) {
    return getAzurePrimaryAdminAnalyticsUsers(input);
  }

  const { filters, page, pageSize, pii } = input;
  const baseWhere: Prisma.UserWhereInput = {
    ...(filters.role !== "ALL" ? { role: filters.role } : {}),
    ...authWhereClauseForUsers(filters.auth)
  };

  const [allUsers, allEvents] = await Promise.all([
    prisma.user.findMany({
      where: baseWhere,
      select: {
        id: true,
        email: true,
        role: true,
        firstSeenCountryCode: true,
        firstSeenRegionCode: true,
        firstSeenCity: true,
        createdAt: true,
        demographicSurvey: {
          select: {
            ageBand: true,
            genderIdentity: true
          }
        },
        oauthIdentities: {
          select: {
            provider: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.analyticsEvent.findMany({
      where: buildEventWhere(filters, [
        "USER_SIGNUP",
        "USER_LOGIN",
        "ITEM_SUBMITTED",
        "ITEM_READY",
        "ITEM_FAILED",
        "PLAYBACK_STARTED"
      ]),
      select: {
        userId: true,
        eventType: true,
        occurredAt: true
      }
    })
  ]);

  type AggregateRow = {
    lastActiveAt: Date | null;
    signups: number;
    logins: number;
    submissions: number;
    ready: number;
    failed: number;
    playbackStarts: number;
  };
  const aggregateByUser = new Map<string, AggregateRow>();
  for (const event of allEvents) {
    if (!event.userId) {
      continue;
    }
    if (!aggregateByUser.has(event.userId)) {
      aggregateByUser.set(event.userId, {
        lastActiveAt: null,
        signups: 0,
        logins: 0,
        submissions: 0,
        ready: 0,
        failed: 0,
        playbackStarts: 0
      });
    }
    const row = aggregateByUser.get(event.userId)!;
    if (event.eventType === "USER_SIGNUP") row.signups += 1;
    if (event.eventType === "USER_LOGIN") row.logins += 1;
    if (event.eventType === "ITEM_SUBMITTED") row.submissions += 1;
    if (event.eventType === "ITEM_READY") row.ready += 1;
    if (event.eventType === "ITEM_FAILED") row.failed += 1;
    if (event.eventType === "PLAYBACK_STARTED") row.playbackStarts += 1;
    if (
      meaningfulEventTypes.includes(event.eventType as (typeof meaningfulEventTypes)[number]) &&
      (!row.lastActiveAt || event.occurredAt.getTime() > row.lastActiveAt.getTime())
    ) {
      row.lastActiveAt = event.occurredAt;
    }
  }

  const filteredRows = allUsers
    .filter((user) => {
      const aggregate = aggregateByUser.get(user.id);
      if (user.createdAt >= filters.from && user.createdAt <= filters.to) {
        return true;
      }
      return Boolean(aggregate);
    })
    .map((user) => {
      const aggregate = aggregateByUser.get(user.id) ?? {
        lastActiveAt: null,
        signups: 0,
        logins: 0,
        submissions: 0,
        ready: 0,
        failed: 0,
        playbackStarts: 0
      };
      const hasOAuth = user.oauthIdentities.length > 0;
      return {
        userId: user.id,
        email: pii ? user.email : maskEmail(user.email),
        role: user.role === "ADMIN" ? "ADMIN" : "USER",
        authProfile: hasOAuth ? "OAUTH_LINKED" : "LOCAL_ONLY",
        firstSeenCountryCode: user.firstSeenCountryCode ?? null,
        firstSeenRegionCode: user.firstSeenRegionCode ?? null,
        firstSeenCity: pii ? user.firstSeenCity ?? null : null,
        ageBand: pii ? user.demographicSurvey?.ageBand ?? null : null,
        genderIdentity: pii ? user.demographicSurvey?.genderIdentity ?? null : null,
        createdAt: user.createdAt.toISOString(),
        lastActiveAt: aggregate.lastActiveAt ? aggregate.lastActiveAt.toISOString() : null,
        signups: aggregate.signups,
        logins: aggregate.logins,
        submissions: aggregate.submissions,
        ready: aggregate.ready,
        failed: aggregate.failed,
        playbackStarts: aggregate.playbackStarts
      } as const;
    });

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const startIndex = (normalizedPage - 1) * pageSize;
  const rows = filteredRows.slice(startIndex, startIndex + pageSize);

  return {
    filters: {
      from: filters.from.toISOString(),
      to: filters.to.toISOString(),
      preset: filters.preset,
      source: filters.source,
      auth: filters.auth,
      role: filters.role,
      page: normalizedPage,
      pageSize,
      pii
    },
    pagination: {
      page: normalizedPage,
      pageSize,
      totalRows,
      totalPages
    },
    rows
  };
}
