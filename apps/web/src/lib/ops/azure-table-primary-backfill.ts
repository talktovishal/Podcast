import type { AzureTablePrimaryEntityKey } from "@articlepod/core";

type AzureTableEntity = Record<string, unknown> & {
  partitionKey: string;
  rowKey: string;
};

export type AzureTablePrimaryBackfillConfig = {
  modelName: string;
  delegate: string;
  orderByField: string;
  tableKey: AzureTablePrimaryEntityKey;
  select?: Record<string, unknown>;
  buildEntity(row: Record<string, any>): AzureTableEntity;
};

function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const azureTablePrimaryBackfillConfigs = [
  {
    modelName: "User",
    delegate: "user",
    orderByField: "id",
    tableKey: "users",
    buildEntity(row) {
      return {
        partitionKey: "user",
        rowKey: row.id,
        email: normalizeEmail(row.email),
        passwordHash: row.passwordHash ?? null,
        name: row.name ?? null,
        role: row.role,
        complimentaryPro: row.complimentaryPro,
        billingProvider: row.billingProvider ?? null,
        billingCustomerId: row.billingCustomerId ?? null,
        billingSubscriptionId: row.billingSubscriptionId ?? null,
        billingPlanCode: row.billingPlanCode,
        billingStatus: row.billingStatus,
        billingCurrentPeriodEnd: isoOrNull(row.billingCurrentPeriodEnd),
        billingCancelAtPeriodEnd: row.billingCancelAtPeriodEnd,
        billingUpdatedAt: isoOrNull(row.billingUpdatedAt),
        isPaid: row.isPaid,
        submissionCount: row.submissionCount,
        extraSubmissionCredits: row.extraSubmissionCredits,
        ttsProvider: row.ttsProvider,
        ttsVoice: row.ttsVoice,
        firstSeenAt: isoOrNull(row.firstSeenAt),
        firstSeenCountryCode: row.firstSeenCountryCode ?? null,
        firstSeenRegionCode: row.firstSeenRegionCode ?? null,
        firstSeenCity: row.firstSeenCity ?? null,
        lastSeenAt: isoOrNull(row.lastSeenAt),
        lastSeenCountryCode: row.lastSeenCountryCode ?? null,
        lastSeenRegionCode: row.lastSeenRegionCode ?? null,
        lastSeenCity: row.lastSeenCity ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      };
    }
  },
  {
    modelName: "Session",
    delegate: "session",
    orderByField: "id",
    tableKey: "sessions",
    buildEntity(row) {
      return {
        partitionKey: "session",
        rowKey: row.tokenHash,
        id: row.id,
        userId: row.userId,
        tokenHash: row.tokenHash,
        expiresAt: row.expiresAt.toISOString(),
        createdAt: row.createdAt.toISOString()
      };
    }
  },
  {
    modelName: "BillingWebhookEvent",
    delegate: "billingWebhookEvent",
    orderByField: "id",
    tableKey: "billingWebhookEvents",
    buildEntity(row) {
      return {
        partitionKey: row.provider,
        rowKey: row.providerEventId,
        id: row.id,
        provider: row.provider,
        providerEventId: row.providerEventId,
        eventType: row.eventType,
        userId: row.userId ?? null,
        customerId: row.customerId ?? null,
        subscriptionId: row.subscriptionId ?? null,
        status: row.status,
        errorMessage: row.errorMessage ?? null,
        processedAt: isoOrNull(row.processedAt),
        createdAt: row.createdAt.toISOString()
      };
    }
  },
  {
    modelName: "FeedToken",
    delegate: "feedToken",
    orderByField: "id",
    tableKey: "feedTokens",
    buildEntity(row) {
      return {
        partitionKey: "feed",
        rowKey: row.id,
        id: row.id,
        userId: row.userId,
        tokenHash: row.tokenHash,
        tokenValue: row.tokenValue ?? null,
        active: row.active,
        createdAt: row.createdAt.toISOString(),
        rotatedAt: isoOrNull(row.rotatedAt)
      };
    }
  },
  {
    modelName: "DigestFeedToken",
    delegate: "digestFeedToken",
    orderByField: "id",
    tableKey: "digestFeedTokens",
    buildEntity(row) {
      return {
        partitionKey: "digestFeed",
        rowKey: row.id,
        id: row.id,
        userId: row.userId,
        tokenHash: row.tokenHash,
        tokenValue: row.tokenValue ?? null,
        active: row.active,
        createdAt: row.createdAt.toISOString(),
        rotatedAt: isoOrNull(row.rotatedAt)
      };
    }
  },
  {
    modelName: "ShareToken",
    delegate: "shareToken",
    orderByField: "id",
    tableKey: "shareTokens",
    buildEntity(row) {
      return {
        partitionKey: "share",
        rowKey: row.id,
        id: row.id,
        userId: row.userId,
        tokenHash: row.tokenHash,
        tokenValue: row.tokenValue ?? null,
        scope: row.scope,
        expiresAt: isoOrNull(row.expiresAt),
        createdAt: row.createdAt.toISOString()
      };
    }
  },
  {
    modelName: "OAuthIdentity",
    delegate: "oAuthIdentity",
    orderByField: "id",
    tableKey: "oauthIdentities",
    buildEntity(row) {
      return {
        partitionKey: "oauth",
        rowKey: `${row.provider}::${row.providerUserId}`,
        id: row.id,
        userId: row.userId,
        provider: row.provider,
        providerUserId: row.providerUserId,
        emailAtLink: row.emailAtLink ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      };
    }
  },
  {
    modelName: "ExtensionConnectCode",
    delegate: "extensionConnectCode",
    orderByField: "id",
    tableKey: "extensionConnectCodes",
    buildEntity(row) {
      return {
        partitionKey: "extCode",
        rowKey: row.codeHash,
        id: row.id,
        userId: row.userId,
        codeHash: row.codeHash,
        label: row.label ?? null,
        expiresAt: row.expiresAt.toISOString(),
        consumedAt: isoOrNull(row.consumedAt),
        createdAt: row.createdAt.toISOString()
      };
    }
  },
  {
    modelName: "ExtensionToken",
    delegate: "extensionToken",
    orderByField: "id",
    tableKey: "extensionTokens",
    buildEntity(row) {
      return {
        partitionKey: "extToken",
        rowKey: row.tokenHash,
        id: row.id,
        userId: row.userId,
        tokenHash: row.tokenHash,
        tokenValue: row.tokenValue ?? null,
        label: row.label ?? null,
        scope: row.scope,
        expiresAt: isoOrNull(row.expiresAt),
        revokedAt: isoOrNull(row.revokedAt),
        lastUsedAt: isoOrNull(row.lastUsedAt),
        createdAt: row.createdAt.toISOString()
      };
    }
  },
  {
    modelName: "Item",
    delegate: "item",
    orderByField: "id",
    tableKey: "items",
    buildEntity(row) {
      return {
        partitionKey: "item",
        rowKey: row.id,
        userId: row.userId,
        title: row.title ?? null,
        sourceType: row.sourceType,
        sourceUrl: row.sourceUrl ?? null,
        sourceFilePath: row.sourceFilePath ?? null,
        sourceHtml: row.sourceHtml ?? null,
        sourceCapturedAt: isoOrNull(row.sourceCapturedAt),
        status: row.status,
        errorCode: row.errorCode ?? null,
        errorMessage: row.errorMessage ?? null,
        textHash: row.textHash ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      };
    }
  },
  {
    modelName: "Job",
    delegate: "job",
    orderByField: "id",
    tableKey: "jobs",
    select: {
      id: true,
      itemId: true,
      attempt: true,
      status: true,
      lockedAt: true,
      nextRetryAt: true,
      errorCode: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
      item: {
        select: {
          userId: true
        }
      }
    },
    buildEntity(row) {
      return {
        partitionKey: "job",
        rowKey: row.id,
        itemId: row.itemId,
        userId: row.item.userId,
        attempt: row.attempt,
        status: row.status,
        lockedAt: isoOrNull(row.lockedAt),
        nextRetryAt: isoOrNull(row.nextRetryAt),
        errorCode: row.errorCode ?? null,
        errorMessage: row.errorMessage ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      };
    }
  },
  {
    modelName: "ItemArtifact",
    delegate: "itemArtifact",
    orderByField: "id",
    tableKey: "itemArtifacts",
    buildEntity(row) {
      return {
        partitionKey: "artifact",
        rowKey: `${row.itemId}::${row.kind}`,
        id: row.id,
        itemId: row.itemId,
        kind: row.kind,
        storageKey: row.storageKey,
        contentType: row.contentType,
        byteLength: row.byteLength,
        expiresAt: isoOrNull(row.expiresAt),
        createdAt: row.createdAt.toISOString()
      };
    }
  },
  {
    modelName: "Episode",
    delegate: "episode",
    orderByField: "id",
    tableKey: "episodes",
    select: {
      id: true,
      itemId: true,
      guid: true,
      title: true,
      description: true,
      audioPath: true,
      audioBytes: true,
      mimeType: true,
      publishedAt: true,
      createdAt: true,
      item: {
        select: {
          userId: true
        }
      }
    },
    buildEntity(row) {
      return {
        partitionKey: "episode",
        rowKey: row.id,
        itemId: row.itemId,
        userId: row.item.userId,
        guid: row.guid,
        title: row.title,
        description: row.description,
        audioPath: row.audioPath,
        audioBytes: row.audioBytes,
        mimeType: row.mimeType,
        publishedAt: row.publishedAt.toISOString(),
        createdAt: row.createdAt.toISOString()
      };
    }
  },
  {
    modelName: "ChunkCache",
    delegate: "chunkCache",
    orderByField: "id",
    tableKey: "chunkCache",
    buildEntity(row) {
      return {
        partitionKey: "chunk",
        rowKey: row.hash,
        id: row.id,
        itemId: row.itemId,
        chunkIndex: row.chunkIndex,
        hash: row.hash,
        filePath: row.filePath,
        audioBytes: row.audioBytes,
        mimeType: row.mimeType,
        createdAt: row.createdAt.toISOString()
      };
    }
  },
  {
    modelName: "UserDigestSettings",
    delegate: "userDigestSettings",
    orderByField: "id",
    tableKey: "digestSettings",
    buildEntity(row) {
      return {
        partitionKey: "digestSettings",
        rowKey: row.userId,
        id: row.id,
        userId: row.userId,
        timezone: row.timezone,
        dailyEmailEnabled: row.dailyEmailEnabled,
        dailyPodcastEnabled: row.dailyPodcastEnabled,
        dailyHour: row.dailyHour,
        dailyMinute: row.dailyMinute,
        dailyLengthMinutes: row.dailyLengthMinutes,
        dailyNextRunAt: isoOrNull(row.dailyNextRunAt),
        weeklyEmailEnabled: row.weeklyEmailEnabled,
        weeklyPodcastEnabled: row.weeklyPodcastEnabled,
        weeklyDayOfWeek: row.weeklyDayOfWeek,
        weeklyHour: row.weeklyHour,
        weeklyMinute: row.weeklyMinute,
        weeklyLengthMinutes: row.weeklyLengthMinutes,
        weeklyNextRunAt: isoOrNull(row.weeklyNextRunAt),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      };
    }
  },
  {
    modelName: "DigestRun",
    delegate: "digestRun",
    orderByField: "id",
    tableKey: "digestRuns",
    buildEntity(row) {
      return {
        partitionKey: "digestRun",
        rowKey: row.id,
        userId: row.userId,
        cadence: row.cadence,
        periodKey: row.periodKey,
        windowStart: row.windowStart.toISOString(),
        windowEnd: row.windowEnd.toISOString(),
        scheduledFor: row.scheduledFor.toISOString(),
        status: row.status,
        attempt: row.attempt,
        lockedAt: isoOrNull(row.lockedAt),
        nextRetryAt: isoOrNull(row.nextRetryAt),
        targetLengthMinutes: row.targetLengthMinutes,
        sourceItemCount: row.sourceItemCount,
        summaryStorageKey: row.summaryStorageKey ?? null,
        summaryBytes: row.summaryBytes ?? null,
        summaryProvider: row.summaryProvider ?? null,
        summaryModel: row.summaryModel ?? null,
        summaryDeployment: row.summaryDeployment ?? null,
        summaryInputTokens: row.summaryInputTokens ?? null,
        summaryOutputTokens: row.summaryOutputTokens ?? null,
        emailEnabled: row.emailEnabled,
        emailStatus: row.emailStatus ?? null,
        emailSubject: row.emailSubject ?? null,
        emailStorageKey: row.emailStorageKey ?? null,
        emailError: row.emailError ?? null,
        podcastEnabled: row.podcastEnabled,
        podcastStatus: row.podcastStatus ?? null,
        podcastError: row.podcastError ?? null,
        errorCode: row.errorCode ?? null,
        errorMessage: row.errorMessage ?? null,
        completedAt: isoOrNull(row.completedAt),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      };
    }
  },
  {
    modelName: "DigestEpisode",
    delegate: "digestEpisode",
    orderByField: "id",
    tableKey: "digestEpisodes",
    buildEntity(row) {
      return {
        partitionKey: "digestEpisode",
        rowKey: row.id,
        digestRunId: row.digestRunId,
        userId: row.userId,
        guid: row.guid,
        title: row.title,
        description: row.description,
        audioPath: row.audioPath,
        audioBytes: row.audioBytes,
        mimeType: row.mimeType,
        publishedAt: row.publishedAt.toISOString(),
        createdAt: row.createdAt.toISOString()
      };
    }
  },
  {
    modelName: "SummaryRun",
    delegate: "summaryRun",
    orderByField: "id",
    tableKey: "summaryRuns",
    buildEntity(row) {
      return {
        partitionKey: "summaryRun",
        rowKey: row.id,
        userId: row.userId,
        requestedTitle: row.requestedTitle ?? null,
        title: row.title ?? null,
        windowStart: row.windowStart.toISOString(),
        windowEnd: row.windowEnd.toISOString(),
        status: row.status,
        attempt: row.attempt,
        lockedAt: isoOrNull(row.lockedAt),
        nextRetryAt: isoOrNull(row.nextRetryAt),
        targetLengthMinutes: row.targetLengthMinutes,
        selectedItemCount: row.selectedItemCount,
        podcastEnabled: row.podcastEnabled,
        podcastStatus: row.podcastStatus ?? null,
        podcastError: row.podcastError ?? null,
        summaryStorageKey: row.summaryStorageKey ?? null,
        summaryBytes: row.summaryBytes ?? null,
        summaryProvider: row.summaryProvider ?? null,
        summaryModel: row.summaryModel ?? null,
        summaryDeployment: row.summaryDeployment ?? null,
        summaryInputTokens: row.summaryInputTokens ?? null,
        summaryOutputTokens: row.summaryOutputTokens ?? null,
        fallbackUsed: row.fallbackUsed,
        errorCode: row.errorCode ?? null,
        errorMessage: row.errorMessage ?? null,
        completedAt: isoOrNull(row.completedAt),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      };
    }
  },
  {
    modelName: "SummaryRunItem",
    delegate: "summaryRunItem",
    orderByField: "id",
    tableKey: "summaryRunItems",
    buildEntity(row) {
      return {
        partitionKey: "summaryRunItem",
        rowKey: `${row.summaryRunId}::${row.itemId}`,
        id: row.id,
        summaryRunId: row.summaryRunId,
        itemId: row.itemId,
        orderIndex: row.orderIndex,
        createdAt: row.createdAt.toISOString()
      };
    }
  },
  {
    modelName: "SummaryEpisode",
    delegate: "summaryEpisode",
    orderByField: "id",
    tableKey: "summaryEpisodes",
    buildEntity(row) {
      return {
        partitionKey: "summaryEpisode",
        rowKey: row.id,
        summaryRunId: row.summaryRunId,
        userId: row.userId,
        guid: row.guid,
        title: row.title,
        description: row.description,
        audioPath: row.audioPath,
        audioBytes: row.audioBytes,
        mimeType: row.mimeType,
        publishedAt: row.publishedAt.toISOString(),
        createdAt: row.createdAt.toISOString()
      };
    }
  },
  {
    modelName: "DigestSchedulerTick",
    delegate: "digestSchedulerTick",
    orderByField: "id",
    tableKey: "digestSchedulerTicks",
    buildEntity(row) {
      return {
        partitionKey: "digestTick",
        rowKey: row.id,
        requestedAt: row.requestedAt.toISOString(),
        requestedBy: row.requestedBy,
        forceNow: row.forceNow,
        processedAt: isoOrNull(row.processedAt)
      };
    }
  },
  {
    modelName: "UserDemographicSurvey",
    delegate: "userDemographicSurvey",
    orderByField: "id",
    tableKey: "userDemographicSurveys",
    buildEntity(row) {
      return {
        partitionKey: "survey",
        rowKey: row.userId,
        id: row.id,
        userId: row.userId,
        status: row.status,
        ageBand: row.ageBand ?? null,
        genderIdentity: row.genderIdentity ?? null,
        genderSelfDescribe: row.genderSelfDescribe ?? null,
        completedAt: isoOrNull(row.completedAt),
        skippedAt: isoOrNull(row.skippedAt),
        deletedAt: isoOrNull(row.deletedAt),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      };
    }
  }
] as const satisfies readonly AzureTablePrimaryBackfillConfig[];

export const azureTablePrimaryBackfillModelNames = azureTablePrimaryBackfillConfigs.map((config) => config.modelName);
