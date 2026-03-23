import type {
  AnalyticsAuthMethod,
  AnalyticsSegmentAuth,
  AnalyticsUserRole,
  AzureTablePrimaryEpisode,
  AzureTablePrimaryJob,
  AzureTablePrimaryOAuthIdentity,
  AzureTablePrimarySession,
  AzureTablePrimaryUser,
  AzureTablePrimaryUserDemographicSurvey
} from "@articlepod/core";
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
import { prisma } from "@/lib/prisma";
import { webPrimaryStore } from "@/lib/metadata-primary-store";

const DAY_MS = 24 * 60 * 60 * 1000;
const PRIMARY_ANALYTICS_CACHE_TTL_MS = 30_000;

type PrimaryAnalyticsItem = {
  id: string;
  userId: string;
  sourceType: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  errorCode: string | null;
  readyAt: Date | null;
};

type PrimaryAnalyticsUserSnapshot = {
  user: AzureTablePrimaryUser;
  oauthIdentities: AzureTablePrimaryOAuthIdentity[];
  demographicSurvey: AzureTablePrimaryUserDemographicSurvey | null;
  sessions: AzureTablePrimarySession[];
  items: PrimaryAnalyticsItem[];
  authMethod: AnalyticsAuthMethod;
  segmentAuth: AnalyticsSegmentAuth;
  userRole: AnalyticsUserRole;
};

export type AzurePrimaryAnalyticsSnapshot = {
  users: PrimaryAnalyticsUserSnapshot[];
  recentJobs: AzureTablePrimaryJob[];
  queueCounts: {
    queuedJobs: number;
    processingJobs: number;
    retryableFailedJobs: number;
  };
};

export type AzurePrimaryAnalyticsPlaybackEvent = {
  day: string;
  occurredAt: Date;
  userId: string | null;
};

let cachedSnapshot:
  | {
      expiresAt: number;
      value: AzurePrimaryAnalyticsSnapshot;
    }
  | null = null;
let inflightSnapshot: Promise<AzurePrimaryAnalyticsSnapshot> | null = null;

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

function resolveAuthProfile(
  role: string,
  oauthIdentities: Array<{ provider: string }>
): {
  authMethod: AnalyticsAuthMethod;
  segmentAuth: AnalyticsSegmentAuth;
  userRole: AnalyticsUserRole;
} {
  const userRole: AnalyticsUserRole = role === "ADMIN" ? "ADMIN" : "USER";
  const providers = new Set(oauthIdentities.map((identity) => identity.provider.toLowerCase()));
  if (providers.size === 0) {
    return { authMethod: "LOCAL", segmentAuth: "LOCAL_ONLY", userRole };
  }
  if (providers.size === 1 && providers.has("google")) {
    return { authMethod: "GOOGLE", segmentAuth: "OAUTH_LINKED", userRole };
  }
  if (providers.size === 1 && providers.has("apple")) {
    return { authMethod: "APPLE", segmentAuth: "OAUTH_LINKED", userRole };
  }
  return { authMethod: "OAUTH_LINKED", segmentAuth: "OAUTH_LINKED", userRole };
}

function matchesAuthFilter(
  snapshot: Pick<PrimaryAnalyticsUserSnapshot, "authMethod" | "segmentAuth">,
  filters: Pick<AdminAnalyticsFilters, "auth">
): boolean {
  if (filters.auth === "ALL") {
    return true;
  }
  if (filters.auth === "OAUTH_LINKED") {
    return snapshot.segmentAuth === "OAUTH_LINKED";
  }
  return snapshot.authMethod === filters.auth;
}

function matchesUserFilters(snapshot: PrimaryAnalyticsUserSnapshot, filters: AdminAnalyticsFilters): boolean {
  if (filters.role !== "ALL" && snapshot.userRole !== filters.role) {
    return false;
  }
  return matchesAuthFilter(snapshot, filters);
}

function matchesSourceFilter(sourceType: string | null | undefined, filters: Pick<AdminAnalyticsFilters, "source">): boolean {
  return filters.source === "ALL" || sourceType === filters.source;
}

function isWithinRange(date: Date, from: Date, to: Date): boolean {
  return date.getTime() >= from.getTime() && date.getTime() <= to.getTime();
}

function pickEarliest(dates: Array<Date | null | undefined>): Date | null {
  let earliest: Date | null = null;
  for (const date of dates) {
    if (!date) {
      continue;
    }
    if (!earliest || date.getTime() < earliest.getTime()) {
      earliest = date;
    }
  }
  return earliest;
}

async function loadCoverageRows(): Promise<AdminAnalyticsCoverage[]> {
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

async function loadPlaybackEvents(filters: AdminAnalyticsFilters): Promise<AzurePrimaryAnalyticsPlaybackEvent[]> {
  const where: Record<string, unknown> = {
    eventType: "PLAYBACK_STARTED",
    occurredAt: {
      gte: filters.from,
      lte: filters.to
    }
  };

  if (filters.source !== "ALL") {
    where.sourceType = filters.source;
  }
  if (filters.role !== "ALL") {
    where.userRole = filters.role;
  }
  if (filters.auth === "OAUTH_LINKED") {
    where.segmentAuth = "OAUTH_LINKED";
  } else if (filters.auth !== "ALL") {
    where.authMethod = filters.auth;
  }

  const rows = await prisma.analyticsEvent.findMany({
    where,
    select: {
      day: true,
      occurredAt: true,
      userId: true
    }
  });

  return rows.map((row) => ({
    day: row.day,
    occurredAt: row.occurredAt,
    userId: row.userId
  }));
}

function mergeCoverage(
  baseCoverage: AdminAnalyticsCoverage[],
  snapshot: AzurePrimaryAnalyticsSnapshot,
  playbackEvents: AzurePrimaryAnalyticsPlaybackEvent[]
): AdminAnalyticsCoverage[] {
  const coverageByKey = new Map(baseCoverage.map((entry) => [entry.metricKey, entry] as const));
  const matchingUsers = snapshot.users;
  const allItems = snapshot.users.flatMap((entry) => entry.items);
  const allSessions = snapshot.users.flatMap((entry) => entry.sessions);

  const derivedRows: AdminAnalyticsCoverage[] = [
    {
      metricKey: "user_signups",
      coverageStartAt: pickEarliest(matchingUsers.map((entry) => entry.user.createdAt))?.toISOString() ?? new Date().toISOString(),
      isBackfilled: true,
      notes: "Derived live from Azure Table primary user records."
    },
    {
      metricKey: "user_logins",
      coverageStartAt:
        pickEarliest(allSessions.map((entry) => entry.createdAt))?.toISOString() ??
        pickEarliest(matchingUsers.map((entry) => entry.user.createdAt))?.toISOString() ??
        new Date().toISOString(),
      isBackfilled: true,
      notes: "Derived live from Azure Table primary session records."
    },
    {
      metricKey: "item_submitted",
      coverageStartAt: pickEarliest(allItems.map((entry) => entry.createdAt))?.toISOString() ?? new Date().toISOString(),
      isBackfilled: true,
      notes: "Derived live from Azure Table primary item records."
    },
    {
      metricKey: "item_ready",
      coverageStartAt:
        pickEarliest(allItems.map((entry) => entry.readyAt))?.toISOString() ??
        pickEarliest(allItems.map((entry) => entry.createdAt))?.toISOString() ??
        new Date().toISOString(),
      isBackfilled: true,
      notes: "Derived live from Azure Table primary item and episode records."
    },
    {
      metricKey: "item_failed",
      coverageStartAt:
        pickEarliest(allItems.filter((entry) => entry.status === "FAILED").map((entry) => entry.updatedAt))?.toISOString() ??
        pickEarliest(allItems.map((entry) => entry.createdAt))?.toISOString() ??
        new Date().toISOString(),
      isBackfilled: true,
      notes: "Derived live from Azure Table primary item status records."
    },
    {
      metricKey: "playback_starts",
      coverageStartAt:
        pickEarliest(playbackEvents.map((entry) => entry.occurredAt))?.toISOString() ?? new Date().toISOString(),
      isBackfilled: false,
      notes:
        playbackEvents.length > 0
          ? "Playback starts are sourced from auxiliary analytics events."
          : "Playback metrics are unavailable until auxiliary analytics event storage is enabled."
    }
  ];

  for (const row of derivedRows) {
    if (!coverageByKey.has(row.metricKey)) {
      coverageByKey.set(row.metricKey, row);
    }
  }

  return Array.from(coverageByKey.values()).sort((a, b) => a.metricKey.localeCompare(b.metricKey));
}

async function buildSnapshot(): Promise<AzurePrimaryAnalyticsSnapshot> {
  if (!webPrimaryStore) {
    throw new Error("Azure Table primary store is not configured.");
  }
  const store = webPrimaryStore;

  const users = await store.listUsers(Number.MAX_SAFE_INTEGER);
  const userSnapshots = await Promise.all(
    users.map(async (user) => {
      const [oauthIdentities, demographicSurvey, sessions, items, episodes] = await Promise.all([
        store.listOAuthIdentitiesByUser(user.id),
        store.findUserDemographicSurvey(user.id),
        store.listSessionsByUser(user.id),
        store.listItemsByUser(user.id, Number.MAX_SAFE_INTEGER),
        store.listEpisodesForUser(user.id)
      ]);

      const episodeByItemId = new Map<string, AzureTablePrimaryEpisode>();
      for (const episode of episodes) {
        episodeByItemId.set(episode.itemId, episode);
      }

      const profile = resolveAuthProfile(user.role, oauthIdentities);
      return {
        user,
        oauthIdentities,
        demographicSurvey,
        sessions,
        items: items.map((item) => ({
          id: item.id,
          userId: item.userId,
          sourceType: item.sourceType,
          status: item.status,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          errorCode: item.errorCode,
          readyAt: episodeByItemId.get(item.id)?.publishedAt ?? (item.status === "READY" ? item.updatedAt : null)
        })),
        ...profile
      } satisfies PrimaryAnalyticsUserSnapshot;
    })
  );

  const now = new Date();
  const [queuedJobs, processingJobs, retryableFailedJobs, recentJobs] = await Promise.all([
    store.countJobs({ status: "QUEUED" }),
    store.countJobs({ status: "PROCESSING" }),
    store.countJobs({ status: "FAILED", retryableBefore: now }),
    store.listRecentJobs(200)
  ]);

  return {
    users: userSnapshots,
    recentJobs,
    queueCounts: {
      queuedJobs,
      processingJobs,
      retryableFailedJobs
    }
  };
}

export async function loadAzurePrimaryAnalyticsSnapshot(): Promise<AzurePrimaryAnalyticsSnapshot> {
  const now = Date.now();
  if (cachedSnapshot && cachedSnapshot.expiresAt > now) {
    return cachedSnapshot.value;
  }
  if (inflightSnapshot) {
    return inflightSnapshot;
  }

  inflightSnapshot = buildSnapshot()
    .then((value) => {
      cachedSnapshot = {
        value,
        expiresAt: Date.now() + PRIMARY_ANALYTICS_CACHE_TTL_MS
      };
      return value;
    })
    .finally(() => {
      inflightSnapshot = null;
    });

  return inflightSnapshot;
}

function buildBaseResponseFilters(filters: AdminAnalyticsFilters) {
  return {
    from: filters.from.toISOString(),
    to: filters.to.toISOString(),
    preset: filters.preset,
    source: filters.source,
    auth: filters.auth,
    role: filters.role
  };
}

type UserAggregateRow = {
  lastActiveAt: Date | null;
  signups: number;
  logins: number;
  submissions: number;
  ready: number;
  failed: number;
  playbackStarts: number;
};

function createEmptyUserAggregate(): UserAggregateRow {
  return {
    lastActiveAt: null,
    signups: 0,
    logins: 0,
    submissions: 0,
    ready: 0,
    failed: 0,
    playbackStarts: 0
  };
}

function mergeMeaningfulActivity(current: Date | null, candidate: Date): Date {
  if (!current || candidate.getTime() > current.getTime()) {
    return candidate;
  }
  return current;
}

function buildPrimaryAggregates(
  snapshot: AzurePrimaryAnalyticsSnapshot,
  filters: AdminAnalyticsFilters,
  playbackEvents: AzurePrimaryAnalyticsPlaybackEvent[]
) {
  const users = snapshot.users.filter((entry) => matchesUserFilters(entry, filters));
  const aggregates = new Map<string, UserAggregateRow>();
  const activeUsersInRange = new Set<string>();
  const dauSet = new Set<string>();
  const wauSet = new Set<string>();
  const mauSet = new Set<string>();
  const recent14dSet = new Set<string>();
  const older30dSet = new Set<string>();
  const powerReadyCounts = new Map<string, number>();
  const playbackCounts = new Map<string, number>();
  const playbackByDay = new Map<string, { count: number; users: Set<string> }>();
  const queueDurations: number[] = [];
  const processingDurations: number[] = [];
  const signupsByDay = new Map<string, number>();
  const submissionsByDay = new Map<string, number>();
  const readyByDay = new Map<string, number>();
  const failedByDay = new Map<string, number>();
  const activityUsersByDay = new Map<string, Set<string>>();

  for (const playback of playbackEvents) {
    const bucket = playbackByDay.get(playback.day) ?? { count: 0, users: new Set<string>() };
    bucket.count += 1;
    if (playback.userId) {
      bucket.users.add(playback.userId);
      playbackCounts.set(playback.userId, (playbackCounts.get(playback.userId) ?? 0) + 1);
    }
    playbackByDay.set(playback.day, bucket);
  }

  const sessionAllowed = filters.source === "ALL";
  const signupAllowed = filters.source === "ALL";

  for (const entry of users) {
    aggregates.set(entry.user.id, createEmptyUserAggregate());

    if (signupAllowed && isWithinRange(entry.user.createdAt, filters.from, filters.to)) {
      signupsByDay.set(toIsoDay(entry.user.createdAt), (signupsByDay.get(toIsoDay(entry.user.createdAt)) ?? 0) + 1);
      aggregates.get(entry.user.id)!.signups = 1;
    }

    if (sessionAllowed) {
      for (const session of entry.sessions) {
        if (!isWithinRange(session.createdAt, filters.from, filters.to)) {
          continue;
        }
        const aggregate = aggregates.get(entry.user.id)!;
        aggregate.logins += 1;
        aggregate.lastActiveAt = mergeMeaningfulActivity(aggregate.lastActiveAt, session.createdAt);
        activeUsersInRange.add(entry.user.id);
        if (isWithinRange(session.createdAt, startOfUtcDay(filters.to), endOfUtcDay(filters.to))) {
          dauSet.add(entry.user.id);
        }
        if (isWithinRange(session.createdAt, startOfUtcDay(addDays(filters.to, -6)), endOfUtcDay(filters.to))) {
          wauSet.add(entry.user.id);
        }
        if (isWithinRange(session.createdAt, startOfUtcDay(addDays(filters.to, -29)), endOfUtcDay(filters.to))) {
          mauSet.add(entry.user.id);
        }
        if (isWithinRange(session.createdAt, startOfUtcDay(addDays(filters.to, -13)), endOfUtcDay(filters.to))) {
          recent14dSet.add(entry.user.id);
        }
        if (isWithinRange(session.createdAt, startOfUtcDay(addDays(filters.to, -43)), endOfUtcDay(addDays(filters.to, -14)))) {
          older30dSet.add(entry.user.id);
        }
        const activityDay = toIsoDay(session.createdAt);
        const bucket = activityUsersByDay.get(activityDay) ?? new Set<string>();
        bucket.add(entry.user.id);
        activityUsersByDay.set(activityDay, bucket);
      }
    }

    for (const item of entry.items) {
      const sourceMatches = matchesSourceFilter(item.sourceType, filters);
      if (!sourceMatches) {
        continue;
      }

      if (isWithinRange(item.createdAt, filters.from, filters.to)) {
        submissionsByDay.set(toIsoDay(item.createdAt), (submissionsByDay.get(toIsoDay(item.createdAt)) ?? 0) + 1);
        const aggregate = aggregates.get(entry.user.id)!;
        aggregate.submissions += 1;
        aggregate.lastActiveAt = mergeMeaningfulActivity(aggregate.lastActiveAt, item.createdAt);
        activeUsersInRange.add(entry.user.id);
        if (isWithinRange(item.createdAt, startOfUtcDay(filters.to), endOfUtcDay(filters.to))) {
          dauSet.add(entry.user.id);
        }
        if (isWithinRange(item.createdAt, startOfUtcDay(addDays(filters.to, -6)), endOfUtcDay(filters.to))) {
          wauSet.add(entry.user.id);
        }
        if (isWithinRange(item.createdAt, startOfUtcDay(addDays(filters.to, -29)), endOfUtcDay(filters.to))) {
          mauSet.add(entry.user.id);
        }
        if (isWithinRange(item.createdAt, startOfUtcDay(addDays(filters.to, -13)), endOfUtcDay(filters.to))) {
          recent14dSet.add(entry.user.id);
        }
        if (isWithinRange(item.createdAt, startOfUtcDay(addDays(filters.to, -43)), endOfUtcDay(addDays(filters.to, -14)))) {
          older30dSet.add(entry.user.id);
        }
        const bucket = activityUsersByDay.get(toIsoDay(item.createdAt)) ?? new Set<string>();
        bucket.add(entry.user.id);
        activityUsersByDay.set(toIsoDay(item.createdAt), bucket);
      }

      if (item.readyAt && isWithinRange(item.readyAt, filters.from, filters.to)) {
        readyByDay.set(toIsoDay(item.readyAt), (readyByDay.get(toIsoDay(item.readyAt)) ?? 0) + 1);
        const aggregate = aggregates.get(entry.user.id)!;
        aggregate.ready += 1;
        aggregate.lastActiveAt = mergeMeaningfulActivity(aggregate.lastActiveAt, item.readyAt);
        activeUsersInRange.add(entry.user.id);
        if (isWithinRange(item.readyAt, startOfUtcDay(filters.to), endOfUtcDay(filters.to))) {
          dauSet.add(entry.user.id);
        }
        if (isWithinRange(item.readyAt, startOfUtcDay(addDays(filters.to, -6)), endOfUtcDay(filters.to))) {
          wauSet.add(entry.user.id);
        }
        if (isWithinRange(item.readyAt, startOfUtcDay(addDays(filters.to, -29)), endOfUtcDay(filters.to))) {
          mauSet.add(entry.user.id);
        }
        if (isWithinRange(item.readyAt, startOfUtcDay(addDays(filters.to, -13)), endOfUtcDay(filters.to))) {
          recent14dSet.add(entry.user.id);
        }
        if (isWithinRange(item.readyAt, startOfUtcDay(addDays(filters.to, -43)), endOfUtcDay(addDays(filters.to, -14)))) {
          older30dSet.add(entry.user.id);
        }
        if (isWithinRange(item.readyAt, startOfUtcDay(addDays(filters.to, -29)), endOfUtcDay(filters.to))) {
          powerReadyCounts.set(entry.user.id, (powerReadyCounts.get(entry.user.id) ?? 0) + 1);
        }
        const bucket = activityUsersByDay.get(toIsoDay(item.readyAt)) ?? new Set<string>();
        bucket.add(entry.user.id);
        activityUsersByDay.set(toIsoDay(item.readyAt), bucket);
      }

      if (item.status === "FAILED" && isWithinRange(item.updatedAt, filters.from, filters.to)) {
        failedByDay.set(toIsoDay(item.updatedAt), (failedByDay.get(toIsoDay(item.updatedAt)) ?? 0) + 1);
        aggregates.get(entry.user.id)!.failed += 1;
      }
    }

    const playbackStartCount = playbackCounts.get(entry.user.id) ?? 0;
    aggregates.get(entry.user.id)!.playbackStarts = playbackStartCount;
    const playbackRows = playbackEvents.filter((row) => row.userId === entry.user.id);
    for (const playback of playbackRows) {
      aggregates.get(entry.user.id)!.lastActiveAt = mergeMeaningfulActivity(
        aggregates.get(entry.user.id)!.lastActiveAt,
        playback.occurredAt
      );
      activeUsersInRange.add(entry.user.id);
      if (isWithinRange(playback.occurredAt, startOfUtcDay(filters.to), endOfUtcDay(filters.to))) {
        dauSet.add(entry.user.id);
      }
      if (isWithinRange(playback.occurredAt, startOfUtcDay(addDays(filters.to, -6)), endOfUtcDay(filters.to))) {
        wauSet.add(entry.user.id);
      }
      if (isWithinRange(playback.occurredAt, startOfUtcDay(addDays(filters.to, -29)), endOfUtcDay(filters.to))) {
        mauSet.add(entry.user.id);
      }
      if (isWithinRange(playback.occurredAt, startOfUtcDay(addDays(filters.to, -13)), endOfUtcDay(filters.to))) {
        recent14dSet.add(entry.user.id);
      }
      if (isWithinRange(playback.occurredAt, startOfUtcDay(addDays(filters.to, -43)), endOfUtcDay(addDays(filters.to, -14)))) {
        older30dSet.add(entry.user.id);
      }
      const bucket = activityUsersByDay.get(playback.day) ?? new Set<string>();
      bucket.add(entry.user.id);
      activityUsersByDay.set(playback.day, bucket);
    }
  }

  for (const row of playbackEvents) {
    if (!isWithinRange(row.occurredAt, filters.from, filters.to)) {
      continue;
    }
    const playbackUsers = playbackByDay.get(row.day)?.users;
    if (!playbackUsers) {
      continue;
    }
    for (const userId of playbackUsers) {
      activeUsersInRange.add(userId);
    }
  }

  return {
    users,
    aggregates,
    playbackByDay,
    signupsByDay,
    submissionsByDay,
    readyByDay,
    failedByDay,
    activityUsersByDay,
    queueDurations,
    processingDurations,
    activeUsersInRange,
    dau: dauSet.size,
    wau: wauSet.size,
    mau: mauSet.size,
    powerUsers30d: Array.from(powerReadyCounts.values()).filter((count) => count >= 3).length,
    atRiskUsers14d: Array.from(older30dSet).filter((userId) => !recent14dSet.has(userId)).length
  };
}

export function buildAzurePrimaryAdminAnalyticsSummary(input: {
  filters: AdminAnalyticsFilters;
  snapshot: AzurePrimaryAnalyticsSnapshot;
  playbackEvents: AzurePrimaryAnalyticsPlaybackEvent[];
  baseCoverage: AdminAnalyticsCoverage[];
}): AdminAnalyticsSummary {
  const { filters, snapshot, playbackEvents, baseCoverage } = input;
  const previousWindowDays = Math.max(1, Math.ceil((filters.to.getTime() - filters.from.getTime() + 1) / DAY_MS));
  const prevTo = new Date(filters.from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - previousWindowDays * DAY_MS + 1);
  const users = snapshot.users.filter((entry) => matchesUserFilters(entry, filters));
  const previousUsers = snapshot.users.filter(
    (entry) => matchesUserFilters(entry, filters) && isWithinRange(entry.user.createdAt, prevFrom, prevTo)
  );
  const cumulativeUsers = snapshot.users.filter(
    (entry) => matchesUserFilters(entry, filters) && entry.user.createdAt.getTime() <= filters.to.getTime()
  ).length;
  const signedUpUsers = users.filter((entry) => isWithinRange(entry.user.createdAt, filters.from, filters.to));
  const derived = buildPrimaryAggregates(snapshot, filters, playbackEvents);

  let submittedItems = 0;
  let readyItems = 0;
  let failedItems = 0;
  const activationDurations: number[] = [];
  let activatedUsers = 0;
  let submitted24h = 0;

  for (const userSnapshot of signedUpUsers) {
    const items = userSnapshot.items
      .filter((item) => matchesSourceFilter(item.sourceType, filters))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const firstSubmission = items[0]?.createdAt ?? null;
    const firstReady = items
      .filter((item) => item.readyAt)
      .map((item) => item.readyAt!)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

    if (firstSubmission) {
      const submitDelta = firstSubmission.getTime() - userSnapshot.user.createdAt.getTime();
      if (submitDelta >= 0 && submitDelta <= DAY_MS) {
        submitted24h += 1;
      }
    }

    if (firstReady) {
      const delta = firstReady.getTime() - userSnapshot.user.createdAt.getTime();
      if (delta >= 0) {
        activationDurations.push(delta);
      }
      if (delta >= 0 && delta <= 7 * DAY_MS) {
        activatedUsers += 1;
      }
    }
  }

  for (const userSnapshot of users) {
    for (const item of userSnapshot.items) {
      if (!matchesSourceFilter(item.sourceType, filters)) {
        continue;
      }
      if (isWithinRange(item.createdAt, filters.from, filters.to)) {
        submittedItems += 1;
      }
      if (item.readyAt && isWithinRange(item.readyAt, filters.from, filters.to)) {
        readyItems += 1;
      }
      if (item.status === "FAILED" && isWithinRange(item.updatedAt, filters.from, filters.to)) {
        failedItems += 1;
      }
    }
  }

  const errorCodeCounts = new Map<string, number>();
  for (const job of snapshot.recentJobs) {
    if (!job.errorCode) {
      continue;
    }
    errorCodeCounts.set(job.errorCode, (errorCodeCounts.get(job.errorCode) ?? 0) + 1);
  }

  const coverage = mergeCoverage(baseCoverage, snapshot, playbackEvents);
  const playbackStarts = playbackEvents.length;
  const newSignups = signedUpUsers.length;

  return {
    filters: buildBaseResponseFilters(filters),
    coverage,
    acquisition: {
      newSignups,
      cumulativeUsers,
      signupGrowthRate: previousUsers.length > 0 ? formatPct(((newSignups - previousUsers.length) / previousUsers.length) * 100) : 0
    },
    activation: {
      activationRate7d: rate(activatedUsers, newSignups),
      medianTimeToFirstReadyMs: median(activationDurations),
      firstSubmission24hRate: rate(submitted24h, newSignups)
    },
    engagement: {
      dau: derived.dau,
      wau: derived.wau,
      mau: derived.mau,
      stickinessDauMau: derived.mau > 0 ? formatPct((derived.dau / derived.mau) * 100) : 0,
      submissionsPerActiveUser:
        derived.activeUsersInRange.size > 0 ? Math.round((submittedItems / derived.activeUsersInRange.size) * 100) / 100 : 0,
      playbackStarts
    },
    funnel: {
      submittedItems,
      readyItems,
      failedItems,
      readyRate: rate(readyItems, submittedItems),
      failureRate: rate(failedItems, submittedItems),
      medianQueueWaitMs: median(derived.queueDurations),
      medianProcessingMs: median(derived.processingDurations),
      queuedJobs: snapshot.queueCounts.queuedJobs,
      processingJobs: snapshot.queueCounts.processingJobs,
      retryableFailedJobs: snapshot.queueCounts.retryableFailedJobs,
      topErrorCodes: Array.from(errorCodeCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([code, count]) => ({ code, count }))
    },
    investor: {
      powerUsers30d: derived.powerUsers30d,
      atRiskUsers14d: derived.atRiskUsers14d
    }
  };
}

export async function getAzurePrimaryAdminAnalyticsSummary(filters: AdminAnalyticsFilters): Promise<AdminAnalyticsSummary> {
  const [snapshot, playbackEvents, baseCoverage] = await Promise.all([
    loadAzurePrimaryAnalyticsSnapshot(),
    loadPlaybackEvents(filters),
    loadCoverageRows()
  ]);
  return buildAzurePrimaryAdminAnalyticsSummary({
    filters,
    snapshot,
    playbackEvents,
    baseCoverage
  });
}

export function buildAzurePrimaryAdminAnalyticsTimeseries(input: {
  filters: AdminAnalyticsFilters;
  snapshot: AzurePrimaryAnalyticsSnapshot;
  playbackEvents: AzurePrimaryAnalyticsPlaybackEvent[];
  baseCoverage: AdminAnalyticsCoverage[];
}): AdminAnalyticsTimeseries {
  const { filters, snapshot, playbackEvents, baseCoverage } = input;
  const derived = buildPrimaryAggregates(snapshot, filters, playbackEvents);
  const coverage = mergeCoverage(baseCoverage, snapshot, playbackEvents);

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
      signups: derived.signupsByDay.get(day) ?? 0,
      submissions: derived.submissionsByDay.get(day) ?? 0,
      ready: derived.readyByDay.get(day) ?? 0,
      failed: derived.failedByDay.get(day) ?? 0,
      playbackStarts: derived.playbackByDay.get(day)?.count ?? 0,
      activeUsers: derived.activityUsersByDay.get(day) ?? new Set<string>()
    });
  }

  const points: AdminAnalyticsTimeseriesPoint[] = [];
  for (let index = 0; index < allDays.length; index += 1) {
    const day = allDays[index]!;
    const bucket = pointsByDay.get(day)!;
    const windowStart = Math.max(0, index - 29);
    const merged = new Set<string>();
    for (let cursor = windowStart; cursor <= index; cursor += 1) {
      const sourceDay = allDays[cursor]!;
      for (const userId of pointsByDay.get(sourceDay)!.activeUsers) {
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
    filters: buildBaseResponseFilters(filters),
    points,
    coverage
  };
}

export async function getAzurePrimaryAdminAnalyticsTimeseries(filters: AdminAnalyticsFilters): Promise<AdminAnalyticsTimeseries> {
  const [snapshot, playbackEvents, baseCoverage] = await Promise.all([
    loadAzurePrimaryAnalyticsSnapshot(),
    loadPlaybackEvents(filters),
    loadCoverageRows()
  ]);
  return buildAzurePrimaryAdminAnalyticsTimeseries({
    filters,
    snapshot,
    playbackEvents,
    baseCoverage
  });
}

export function buildAzurePrimaryAdminAnalyticsRetention(input: {
  filters: AdminAnalyticsFilters;
  snapshot: AzurePrimaryAnalyticsSnapshot;
  playbackEvents: AzurePrimaryAnalyticsPlaybackEvent[];
  baseCoverage: AdminAnalyticsCoverage[];
}): AdminAnalyticsRetention {
  const { filters, snapshot, playbackEvents, baseCoverage } = input;
  const extendedTo = addDays(filters.to, 40);
  const relevantPlaybackEvents = playbackEvents.filter((entry) => entry.occurredAt.getTime() <= extendedTo.getTime());
  const coverage = mergeCoverage(baseCoverage, snapshot, relevantPlaybackEvents);
  const users = snapshot.users.filter(
    (entry) => matchesUserFilters(entry, filters) && isWithinRange(entry.user.createdAt, filters.from, filters.to)
  );

  type CohortAccumulator = {
    size: number;
    w1: number;
    w2: number;
    w4: number;
    d1: number;
    d7: number;
    d30: number;
  };

  const playbackDatesByUser = new Map<string, Date[]>();
  for (const playback of relevantPlaybackEvents) {
    if (!playback.userId) {
      continue;
    }
    const rows = playbackDatesByUser.get(playback.userId) ?? [];
    rows.push(playback.occurredAt);
    playbackDatesByUser.set(playback.userId, rows);
  }

  const cohorts = new Map<string, CohortAccumulator>();
  for (const entry of users) {
    const signup = entry.user.createdAt;
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

    const activityDates: Date[] = [];
    if (filters.source === "ALL") {
      activityDates.push(...entry.sessions.map((session) => session.createdAt));
    }
    activityDates.push(...entry.items.filter((item) => matchesSourceFilter(item.sourceType, filters)).map((item) => item.createdAt));
    activityDates.push(
      ...entry.items
        .filter((item) => matchesSourceFilter(item.sourceType, filters) && item.readyAt)
        .map((item) => item.readyAt!)
    );
    activityDates.push(...(playbackDatesByUser.get(entry.user.id) ?? []));

    let hasW1 = false;
    let hasW2 = false;
    let hasW4 = false;
    let hasD1 = false;
    let hasD7 = false;
    let hasD30 = false;

    for (const when of activityDates) {
      if (when.getTime() < filters.from.getTime() || when.getTime() > extendedTo.getTime()) {
        continue;
      }
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
    filters: buildBaseResponseFilters(filters),
    rows,
    coverage
  };
}

export async function getAzurePrimaryAdminAnalyticsRetention(filters: AdminAnalyticsFilters): Promise<AdminAnalyticsRetention> {
  const extendedFilters = {
    ...filters,
    to: addDays(filters.to, 40)
  };
  const [snapshot, playbackEvents, baseCoverage] = await Promise.all([
    loadAzurePrimaryAnalyticsSnapshot(),
    loadPlaybackEvents(extendedFilters),
    loadCoverageRows()
  ]);
  return buildAzurePrimaryAdminAnalyticsRetention({
    filters,
    snapshot,
    playbackEvents,
    baseCoverage
  });
}

export function buildAzurePrimaryAdminAnalyticsUsers(input: {
  filters: AdminAnalyticsFilters;
  snapshot: AzurePrimaryAnalyticsSnapshot;
  playbackEvents: AzurePrimaryAnalyticsPlaybackEvent[];
  page: number;
  pageSize: number;
  pii: boolean;
}): AdminAnalyticsUsers {
  const { filters, snapshot, playbackEvents, page, pageSize, pii } = input;
  const derived = buildPrimaryAggregates(snapshot, filters, playbackEvents);

  const filteredRows = snapshot.users
    .filter((entry) => matchesUserFilters(entry, filters))
    .sort((a, b) => b.user.createdAt.getTime() - a.user.createdAt.getTime())
    .filter((entry) => {
      const aggregate = derived.aggregates.get(entry.user.id) ?? createEmptyUserAggregate();
      if (isWithinRange(entry.user.createdAt, filters.from, filters.to)) {
        return true;
      }
      return Boolean(
        aggregate.signups ||
          aggregate.logins ||
          aggregate.submissions ||
          aggregate.ready ||
          aggregate.failed ||
          aggregate.playbackStarts
      );
    })
    .map((entry) => {
      const aggregate = derived.aggregates.get(entry.user.id) ?? createEmptyUserAggregate();
      return {
        userId: entry.user.id,
        email: pii ? entry.user.email : maskEmail(entry.user.email),
        role: entry.userRole,
        authProfile: entry.segmentAuth,
        firstSeenCountryCode: entry.user.firstSeenCountryCode ?? null,
        firstSeenRegionCode: entry.user.firstSeenRegionCode ?? null,
        firstSeenCity: pii ? entry.user.firstSeenCity ?? null : null,
        ageBand: pii ? entry.demographicSurvey?.ageBand ?? null : null,
        genderIdentity: pii ? entry.demographicSurvey?.genderIdentity ?? null : null,
        createdAt: entry.user.createdAt.toISOString(),
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

  return {
    filters: {
      ...buildBaseResponseFilters(filters),
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
    rows: filteredRows.slice(startIndex, startIndex + pageSize)
  };
}

export async function getAzurePrimaryAdminAnalyticsUsers(input: {
  filters: AdminAnalyticsFilters;
  page: number;
  pageSize: number;
  pii: boolean;
}): Promise<AdminAnalyticsUsers> {
  const [snapshot, playbackEvents] = await Promise.all([
    loadAzurePrimaryAnalyticsSnapshot(),
    loadPlaybackEvents(input.filters)
  ]);
  return buildAzurePrimaryAdminAnalyticsUsers({
    ...input,
    snapshot,
    playbackEvents
  });
}
