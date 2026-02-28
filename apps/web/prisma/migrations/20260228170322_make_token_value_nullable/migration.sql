-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "extraSubmissionCredits" INTEGER NOT NULL DEFAULT 0,
    "ttsProvider" TEXT NOT NULL DEFAULT 'kokoro',
    "ttsVoice" TEXT NOT NULL DEFAULT 'af_heart',
    "firstSeenAt" DATETIME,
    "firstSeenCountryCode" TEXT,
    "firstSeenRegionCode" TEXT,
    "firstSeenCity" TEXT,
    "lastSeenAt" DATETIME,
    "lastSeenCountryCode" TEXT,
    "lastSeenRegionCode" TEXT,
    "lastSeenCity" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeedToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenValue" TEXT,
    "tokenHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" DATETIME,
    CONSTRAINT "FeedToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShareToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenValue" TEXT,
    "tokenHash" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'read_only',
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShareToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceFilePath" TEXT,
    "sourceHtml" TEXT,
    "sourceCapturedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "textHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItemArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemArtifact_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OAuthIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "emailAtLink" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OAuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExtensionConnectCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtensionConnectCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExtensionToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenValue" TEXT,
    "label" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'ingest:html_snapshot',
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtensionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "audioPath" TEXT NOT NULL,
    "audioBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Episode_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "lockedAt" DATETIME,
    "nextRetryAt" DATETIME,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChunkCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "audioBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChunkCache_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DemoExtractionTrace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "extractedMarkdown" TEXT,
    "extractionLogJson" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DemoExtractionTrace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DemoExtractionTrace_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "day" TEXT NOT NULL,
    "userId" TEXT,
    "itemId" TEXT,
    "sourceType" TEXT,
    "authMethod" TEXT,
    "userRole" TEXT,
    "segmentAuth" TEXT,
    "metadataJson" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AnalyticsEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalyticsDailyRollup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "segmentKey" TEXT NOT NULL,
    "signups" INTEGER NOT NULL DEFAULT 0,
    "logins" INTEGER NOT NULL DEFAULT 0,
    "submissions" INTEGER NOT NULL DEFAULT 0,
    "ready" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "playbackStarts" INTEGER NOT NULL DEFAULT 0,
    "processingDurationMsTotal" INTEGER NOT NULL DEFAULT 0,
    "processingDurationSamples" INTEGER NOT NULL DEFAULT 0,
    "queueWaitDurationMsTotal" INTEGER NOT NULL DEFAULT 0,
    "queueWaitDurationSamples" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AnalyticsCoverage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metricKey" TEXT NOT NULL,
    "coverageStartAt" DATETIME NOT NULL,
    "isBackfilled" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserDigestSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "dailyEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyPodcastEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyHour" INTEGER NOT NULL DEFAULT 16,
    "dailyMinute" INTEGER NOT NULL DEFAULT 0,
    "dailyLengthMinutes" INTEGER NOT NULL DEFAULT 5,
    "dailyNextRunAt" DATETIME,
    "weeklyEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "weeklyPodcastEnabled" BOOLEAN NOT NULL DEFAULT true,
    "weeklyDayOfWeek" INTEGER NOT NULL DEFAULT 5,
    "weeklyHour" INTEGER NOT NULL DEFAULT 16,
    "weeklyMinute" INTEGER NOT NULL DEFAULT 0,
    "weeklyLengthMinutes" INTEGER NOT NULL DEFAULT 15,
    "weeklyNextRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserDigestSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DigestFeedToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenValue" TEXT,
    "tokenHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" DATETIME,
    CONSTRAINT "DigestFeedToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DigestRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "windowEnd" DATETIME NOT NULL,
    "scheduledFor" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" DATETIME,
    "nextRetryAt" DATETIME,
    "targetLengthMinutes" INTEGER NOT NULL,
    "sourceItemCount" INTEGER NOT NULL DEFAULT 0,
    "summaryStorageKey" TEXT,
    "summaryBytes" INTEGER,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailStatus" TEXT,
    "emailSubject" TEXT,
    "emailStorageKey" TEXT,
    "emailError" TEXT,
    "podcastEnabled" BOOLEAN NOT NULL DEFAULT false,
    "podcastStatus" TEXT,
    "podcastError" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DigestRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DigestEpisode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "digestRunId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "audioPath" TEXT NOT NULL,
    "audioBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DigestEpisode_digestRunId_fkey" FOREIGN KEY ("digestRunId") REFERENCES "DigestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DigestEpisode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DigestSchedulerTick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedBy" TEXT NOT NULL,
    "forceNow" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" DATETIME
);

-- CreateTable
CREATE TABLE "UserDemographicSurvey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ageBand" TEXT,
    "genderIdentity" TEXT,
    "genderSelfDescribe" TEXT,
    "completedAt" DATETIME,
    "skippedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserDemographicSurvey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "FeedToken_tokenValue_key" ON "FeedToken"("tokenValue");

-- CreateIndex
CREATE UNIQUE INDEX "FeedToken_tokenHash_key" ON "FeedToken"("tokenHash");

-- CreateIndex
CREATE INDEX "FeedToken_userId_active_idx" ON "FeedToken"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ShareToken_tokenValue_key" ON "ShareToken"("tokenValue");

-- CreateIndex
CREATE UNIQUE INDEX "ShareToken_tokenHash_key" ON "ShareToken"("tokenHash");

-- CreateIndex
CREATE INDEX "Item_userId_status_idx" ON "Item"("userId", "status");

-- CreateIndex
CREATE INDEX "ItemArtifact_kind_createdAt_idx" ON "ItemArtifact"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "ItemArtifact_expiresAt_idx" ON "ItemArtifact"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ItemArtifact_itemId_kind_key" ON "ItemArtifact"("itemId", "kind");

-- CreateIndex
CREATE INDEX "OAuthIdentity_userId_provider_idx" ON "OAuthIdentity"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthIdentity_provider_providerUserId_key" ON "OAuthIdentity"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionConnectCode_codeHash_key" ON "ExtensionConnectCode"("codeHash");

-- CreateIndex
CREATE INDEX "ExtensionConnectCode_userId_createdAt_idx" ON "ExtensionConnectCode"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionToken_tokenHash_key" ON "ExtensionToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionToken_tokenValue_key" ON "ExtensionToken"("tokenValue");

-- CreateIndex
CREATE INDEX "ExtensionToken_userId_createdAt_idx" ON "ExtensionToken"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_itemId_key" ON "Episode"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_guid_key" ON "Episode"("guid");

-- CreateIndex
CREATE INDEX "Episode_publishedAt_idx" ON "Episode"("publishedAt");

-- CreateIndex
CREATE INDEX "Job_status_createdAt_idx" ON "Job"("status", "createdAt");

-- CreateIndex
CREATE INDEX "JobEvent_jobId_createdAt_idx" ON "JobEvent"("jobId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChunkCache_hash_key" ON "ChunkCache"("hash");

-- CreateIndex
CREATE INDEX "ChunkCache_itemId_idx" ON "ChunkCache"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoExtractionTrace_itemId_key" ON "DemoExtractionTrace"("itemId");

-- CreateIndex
CREATE INDEX "DemoExtractionTrace_userId_updatedAt_idx" ON "DemoExtractionTrace"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsEvent_dedupeKey_key" ON "AnalyticsEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_occurredAt_eventType_idx" ON "AnalyticsEvent"("occurredAt", "eventType");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_day_eventType_idx" ON "AnalyticsEvent"("day", "eventType");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_userId_day_idx" ON "AnalyticsEvent"("userId", "day");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_itemId_day_idx" ON "AnalyticsEvent"("itemId", "day");

-- CreateIndex
CREATE INDEX "AnalyticsDailyRollup_day_idx" ON "AnalyticsDailyRollup"("day");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDailyRollup_day_segmentKey_key" ON "AnalyticsDailyRollup"("day", "segmentKey");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsCoverage_metricKey_key" ON "AnalyticsCoverage"("metricKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserDigestSettings_userId_key" ON "UserDigestSettings"("userId");

-- CreateIndex
CREATE INDEX "UserDigestSettings_dailyNextRunAt_idx" ON "UserDigestSettings"("dailyNextRunAt");

-- CreateIndex
CREATE INDEX "UserDigestSettings_weeklyNextRunAt_idx" ON "UserDigestSettings"("weeklyNextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "DigestFeedToken_tokenValue_key" ON "DigestFeedToken"("tokenValue");

-- CreateIndex
CREATE UNIQUE INDEX "DigestFeedToken_tokenHash_key" ON "DigestFeedToken"("tokenHash");

-- CreateIndex
CREATE INDEX "DigestFeedToken_userId_active_idx" ON "DigestFeedToken"("userId", "active");

-- CreateIndex
CREATE INDEX "DigestRun_status_scheduledFor_idx" ON "DigestRun"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "DigestRun_status_nextRetryAt_idx" ON "DigestRun"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "DigestRun_userId_createdAt_idx" ON "DigestRun"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DigestRun_userId_cadence_periodKey_key" ON "DigestRun"("userId", "cadence", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "DigestEpisode_digestRunId_key" ON "DigestEpisode"("digestRunId");

-- CreateIndex
CREATE UNIQUE INDEX "DigestEpisode_guid_key" ON "DigestEpisode"("guid");

-- CreateIndex
CREATE INDEX "DigestEpisode_userId_publishedAt_idx" ON "DigestEpisode"("userId", "publishedAt");

-- CreateIndex
CREATE INDEX "DigestSchedulerTick_processedAt_requestedAt_idx" ON "DigestSchedulerTick"("processedAt", "requestedAt");

-- CreateIndex
CREATE INDEX "DigestSchedulerTick_requestedAt_idx" ON "DigestSchedulerTick"("requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserDemographicSurvey_userId_key" ON "UserDemographicSurvey"("userId");

-- CreateIndex
CREATE INDEX "UserDemographicSurvey_status_updatedAt_idx" ON "UserDemographicSurvey"("status", "updatedAt");
