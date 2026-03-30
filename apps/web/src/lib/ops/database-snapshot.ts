export type DatabaseSnapshotModelConfig = {
  modelName: string;
  exportKey: string;
  delegate: string;
  orderByField: string;
  dateFields: readonly string[];
  jsonFields?: readonly string[];
  nullableJsonFields?: readonly string[];
};

export const databaseSnapshotModelConfigs = [
  {
    modelName: "User",
    exportKey: "users",
    delegate: "user",
    orderByField: "id",
    dateFields: [
      "billingLastStripeEventCreatedAt",
      "billingLastSubscriptionEventAt",
      "billingLastInvoiceEventAt",
      "billingCurrentPeriodEnd",
      "billingUpdatedAt",
      "firstSeenAt",
      "lastSeenAt",
      "createdAt",
      "updatedAt"
    ]
  },
  {
    modelName: "Session",
    exportKey: "sessions",
    delegate: "session",
    orderByField: "id",
    dateFields: ["expiresAt", "createdAt"]
  },
  {
    modelName: "FeedToken",
    exportKey: "feedTokens",
    delegate: "feedToken",
    orderByField: "id",
    dateFields: ["createdAt", "rotatedAt"]
  },
  {
    modelName: "ShareToken",
    exportKey: "shareTokens",
    delegate: "shareToken",
    orderByField: "id",
    dateFields: ["expiresAt", "createdAt"]
  },
  {
    modelName: "OAuthIdentity",
    exportKey: "oauthIdentities",
    delegate: "oAuthIdentity",
    orderByField: "id",
    dateFields: ["createdAt", "updatedAt"]
  },
  {
    modelName: "ExtensionConnectCode",
    exportKey: "extensionConnectCodes",
    delegate: "extensionConnectCode",
    orderByField: "id",
    dateFields: ["expiresAt", "consumedAt", "createdAt"]
  },
  {
    modelName: "ExtensionToken",
    exportKey: "extensionTokens",
    delegate: "extensionToken",
    orderByField: "id",
    dateFields: ["expiresAt", "revokedAt", "lastUsedAt", "createdAt"]
  },
  {
    modelName: "Item",
    exportKey: "items",
    delegate: "item",
    orderByField: "id",
    dateFields: ["sourceCapturedAt", "createdAt", "updatedAt"]
  },
  {
    modelName: "ItemArtifact",
    exportKey: "itemArtifacts",
    delegate: "itemArtifact",
    orderByField: "id",
    dateFields: ["expiresAt", "createdAt"]
  },
  {
    modelName: "Episode",
    exportKey: "episodes",
    delegate: "episode",
    orderByField: "id",
    dateFields: ["publishedAt", "expiresAt", "createdAt"]
  },
  {
    modelName: "Job",
    exportKey: "jobs",
    delegate: "job",
    orderByField: "id",
    dateFields: ["lockedAt", "scheduledFor", "nextRetryAt", "createdAt", "updatedAt"]
  },
  {
    modelName: "JobEvent",
    exportKey: "jobEvents",
    delegate: "jobEvent",
    orderByField: "id",
    dateFields: ["createdAt"],
    jsonFields: ["payloadJson"]
  },
  {
    modelName: "ChunkCache",
    exportKey: "chunkCaches",
    delegate: "chunkCache",
    orderByField: "id",
    dateFields: ["createdAt"]
  },
  {
    modelName: "DemoExtractionTrace",
    exportKey: "demoExtractionTraces",
    delegate: "demoExtractionTrace",
    orderByField: "id",
    dateFields: ["createdAt", "updatedAt"],
    jsonFields: ["extractionLogJson"]
  },
  {
    modelName: "AnalyticsEvent",
    exportKey: "analyticsEvents",
    delegate: "analyticsEvent",
    orderByField: "id",
    dateFields: ["occurredAt", "createdAt"],
    nullableJsonFields: ["metadataJson"]
  },
  {
    modelName: "AnalyticsDailyRollup",
    exportKey: "analyticsDailyRollups",
    delegate: "analyticsDailyRollup",
    orderByField: "id",
    dateFields: ["createdAt", "updatedAt"]
  },
  {
    modelName: "AnalyticsCoverage",
    exportKey: "analyticsCoverage",
    delegate: "analyticsCoverage",
    orderByField: "id",
    dateFields: ["coverageStartAt", "createdAt", "updatedAt"]
  },
  {
    modelName: "UserDigestSettings",
    exportKey: "userDigestSettings",
    delegate: "userDigestSettings",
    orderByField: "id",
    dateFields: ["dailyNextRunAt", "weeklyNextRunAt", "createdAt", "updatedAt"]
  },
  {
    modelName: "DigestFeedToken",
    exportKey: "digestFeedTokens",
    delegate: "digestFeedToken",
    orderByField: "id",
    dateFields: ["createdAt", "rotatedAt"]
  },
  {
    modelName: "DigestRun",
    exportKey: "digestRuns",
    delegate: "digestRun",
    orderByField: "id",
    dateFields: ["windowStart", "windowEnd", "scheduledFor", "lockedAt", "nextRetryAt", "completedAt", "createdAt", "updatedAt"]
  },
  {
    modelName: "DigestEpisode",
    exportKey: "digestEpisodes",
    delegate: "digestEpisode",
    orderByField: "id",
    dateFields: ["publishedAt", "expiresAt", "createdAt"]
  },
  {
    modelName: "SummaryRun",
    exportKey: "summaryRuns",
    delegate: "summaryRun",
    orderByField: "id",
    dateFields: ["windowStart", "windowEnd", "lockedAt", "nextRetryAt", "completedAt", "createdAt", "updatedAt"]
  },
  {
    modelName: "SummaryRunItem",
    exportKey: "summaryRunItems",
    delegate: "summaryRunItem",
    orderByField: "id",
    dateFields: ["createdAt"]
  },
  {
    modelName: "SummaryEpisode",
    exportKey: "summaryEpisodes",
    delegate: "summaryEpisode",
    orderByField: "id",
    dateFields: ["publishedAt", "expiresAt", "createdAt"]
  },
  {
    modelName: "DigestSchedulerTick",
    exportKey: "digestSchedulerTicks",
    delegate: "digestSchedulerTick",
    orderByField: "id",
    dateFields: ["requestedAt", "processedAt"]
  },
  {
    modelName: "UserDemographicSurvey",
    exportKey: "userDemographicSurveys",
    delegate: "userDemographicSurvey",
    orderByField: "id",
    dateFields: ["completedAt", "skippedAt", "deletedAt", "createdAt", "updatedAt"]
  },
  {
    modelName: "UserFeedback",
    exportKey: "userFeedback",
    delegate: "userFeedback",
    orderByField: "id",
    dateFields: ["mirrorAttemptedAt", "createdAt", "updatedAt"]
  },
  {
    modelName: "BillingWebhookEvent",
    exportKey: "billingWebhookEvents",
    delegate: "billingWebhookEvent",
    orderByField: "id",
    dateFields: ["eventCreatedAt", "processedAt", "createdAt"]
  },
  {
    modelName: "RateLimitBucket",
    exportKey: "rateLimitBuckets",
    delegate: "rateLimitBucket",
    orderByField: "key",
    dateFields: ["resetAt", "updatedAt"]
  }
] as const satisfies readonly DatabaseSnapshotModelConfig[];

export const databaseSnapshotModelNames = databaseSnapshotModelConfigs.map((config) => config.modelName);
