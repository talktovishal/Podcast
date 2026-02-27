import type {
  AnalyticsAuthMethod,
  AnalyticsEventType,
  AnalyticsSegmentAuth,
  AnalyticsSourceType,
  AnalyticsUserRole
} from "@articlepod/core";

export type AdminAnalyticsDatePreset = "7d" | "30d" | "90d" | "custom";
export type AdminAnalyticsFilterRole = "ALL" | AnalyticsUserRole;
export type AdminAnalyticsFilterSource = "ALL" | AnalyticsSourceType;
export type AdminAnalyticsFilterAuth = "ALL" | AnalyticsAuthMethod;

export type AdminAnalyticsFilters = {
  from: Date;
  to: Date;
  preset: AdminAnalyticsDatePreset;
  source: AdminAnalyticsFilterSource;
  auth: AdminAnalyticsFilterAuth;
  role: AdminAnalyticsFilterRole;
};

export type AdminAnalyticsCoverage = {
  metricKey: string;
  coverageStartAt: string;
  isBackfilled: boolean;
  notes: string | null;
};

export type AdminAnalyticsSummary = {
  filters: {
    from: string;
    to: string;
    preset: AdminAnalyticsDatePreset;
    source: AdminAnalyticsFilterSource;
    auth: AdminAnalyticsFilterAuth;
    role: AdminAnalyticsFilterRole;
  };
  coverage: AdminAnalyticsCoverage[];
  acquisition: {
    newSignups: number;
    cumulativeUsers: number;
    signupGrowthRate: number;
  };
  activation: {
    activationRate7d: number;
    medianTimeToFirstReadyMs: number;
    firstSubmission24hRate: number;
  };
  engagement: {
    dau: number;
    wau: number;
    mau: number;
    stickinessDauMau: number;
    submissionsPerActiveUser: number;
    playbackStarts: number;
  };
  funnel: {
    submittedItems: number;
    readyItems: number;
    failedItems: number;
    readyRate: number;
    failureRate: number;
    medianQueueWaitMs: number;
    medianProcessingMs: number;
    retryableFailedJobs: number;
    processingJobs: number;
    queuedJobs: number;
    topErrorCodes: Array<{ code: string; count: number }>;
  };
  investor: {
    powerUsers30d: number;
    atRiskUsers14d: number;
  };
};

export type AdminAnalyticsTimeseriesPoint = {
  day: string;
  signups: number;
  submissions: number;
  ready: number;
  failed: number;
  playbackStarts: number;
  dailyActiveUsers: number;
  rollingMau: number;
  readyRate: number;
};

export type AdminAnalyticsTimeseries = {
  filters: {
    from: string;
    to: string;
    preset: AdminAnalyticsDatePreset;
    source: AdminAnalyticsFilterSource;
    auth: AdminAnalyticsFilterAuth;
    role: AdminAnalyticsFilterRole;
  };
  points: AdminAnalyticsTimeseriesPoint[];
  coverage: AdminAnalyticsCoverage[];
};

export type AdminAnalyticsRetentionRow = {
  cohortWeekStart: string;
  cohortSize: number;
  w1: number;
  w2: number;
  w4: number;
  d1: number;
  d7: number;
  d30: number;
};

export type AdminAnalyticsRetention = {
  filters: {
    from: string;
    to: string;
    preset: AdminAnalyticsDatePreset;
    source: AdminAnalyticsFilterSource;
    auth: AdminAnalyticsFilterAuth;
    role: AdminAnalyticsFilterRole;
  };
  rows: AdminAnalyticsRetentionRow[];
  coverage: AdminAnalyticsCoverage[];
};

export type AdminAnalyticsUserRow = {
  userId: string;
  email: string;
  role: AnalyticsUserRole;
  authProfile: AnalyticsSegmentAuth;
  createdAt: string;
  lastActiveAt: string | null;
  signups: number;
  logins: number;
  submissions: number;
  ready: number;
  failed: number;
  playbackStarts: number;
};

export type AdminAnalyticsUsers = {
  filters: {
    from: string;
    to: string;
    preset: AdminAnalyticsDatePreset;
    source: AdminAnalyticsFilterSource;
    auth: AdminAnalyticsFilterAuth;
    role: AdminAnalyticsFilterRole;
    page: number;
    pageSize: number;
    pii: boolean;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
  rows: AdminAnalyticsUserRow[];
};

export type RecordAnalyticsEventInput = {
  eventType: AnalyticsEventType;
  userId?: string | null;
  itemId?: string | null;
  sourceType?: AnalyticsSourceType | null;
  authMethod?: AnalyticsAuthMethod | null;
  userRole?: AnalyticsUserRole | null;
  segmentAuth?: AnalyticsSegmentAuth | null;
  dedupeKey: string;
  occurredAt?: Date;
  metadata?: Record<string, unknown> | null;
};
