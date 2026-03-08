import {
  buildAnalyticsSegmentKey,
  toAnalyticsDay,
  type AnalyticsAuthMethod,
  type AnalyticsSegmentAuth,
  type AnalyticsSourceType,
  type AnalyticsUserRole
} from "@articlepod/core";
import { Prisma } from "@prisma/client";
import { workerEnv } from "./env.js";
import { prisma } from "./prisma.js";
import { workerLogger } from "./logger.js";

type WorkerAnalyticsEventType = "ITEM_READY" | "ITEM_FAILED";

type WorkerRecordAnalyticsEventInput = {
  eventType: WorkerAnalyticsEventType;
  userId: string;
  itemId: string;
  sourceType: AnalyticsSourceType;
  dedupeKey: string;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
};

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function resolveUserProfile(userId: string): Promise<{
  authMethod: AnalyticsAuthMethod;
  segmentAuth: AnalyticsSegmentAuth;
  userRole: AnalyticsUserRole;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      oauthIdentities: {
        select: {
          provider: true
        }
      }
    }
  });

  if (!user) {
    return {
      authMethod: "LOCAL",
      segmentAuth: "LOCAL_ONLY",
      userRole: "USER"
    };
  }

  const userRole: AnalyticsUserRole = user.role === "ADMIN" ? "ADMIN" : "USER";
  const providers = new Set(user.oauthIdentities.map((identity) => identity.provider.toLowerCase()));
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

export async function recordWorkerAnalyticsEventBestEffort(input: WorkerRecordAnalyticsEventInput): Promise<void> {
  if (workerEnv.analyticsStorageMode === "off") {
    return;
  }

  const occurredAt = input.occurredAt ?? new Date();
  const day = toAnalyticsDay(occurredAt);

  try {
    const profile = await resolveUserProfile(input.userId);
    const segmentKey = buildAnalyticsSegmentKey({
      sourceType: input.sourceType,
      authMethod: profile.authMethod,
      userRole: profile.userRole
    });

    const processingDurationMs = Number(input.metadata?.processing_duration_ms ?? NaN);
    const queueWaitMs = Number(input.metadata?.queue_wait_ms ?? NaN);

    await prisma.$transaction(async (tx) => {
      await tx.analyticsEvent.create({
        data: {
          eventType: input.eventType,
          occurredAt,
          day,
          userId: input.userId,
          itemId: input.itemId,
          sourceType: input.sourceType,
          authMethod: profile.authMethod,
          userRole: profile.userRole,
          segmentAuth: profile.segmentAuth,
          metadataJson: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
          dedupeKey: input.dedupeKey
        }
      });

      await tx.analyticsDailyRollup.upsert({
        where: {
          day_segmentKey: {
            day,
            segmentKey
          }
        },
        update: {
          ...(input.eventType === "ITEM_READY" ? { ready: { increment: 1 } } : {}),
          ...(input.eventType === "ITEM_FAILED" ? { failed: { increment: 1 } } : {}),
          ...(Number.isFinite(processingDurationMs) && processingDurationMs >= 0
            ? {
                processingDurationMsTotal: { increment: Math.round(processingDurationMs) },
                processingDurationSamples: { increment: 1 }
              }
            : {}),
          ...(Number.isFinite(queueWaitMs) && queueWaitMs >= 0
            ? {
                queueWaitDurationMsTotal: { increment: Math.round(queueWaitMs) },
                queueWaitDurationSamples: { increment: 1 }
              }
            : {})
        },
        create: {
          day,
          segmentKey,
          signups: 0,
          logins: 0,
          submissions: 0,
          ready: input.eventType === "ITEM_READY" ? 1 : 0,
          failed: input.eventType === "ITEM_FAILED" ? 1 : 0,
          playbackStarts: 0,
          processingDurationMsTotal:
            Number.isFinite(processingDurationMs) && processingDurationMs >= 0 ? Math.round(processingDurationMs) : 0,
          processingDurationSamples: Number.isFinite(processingDurationMs) && processingDurationMs >= 0 ? 1 : 0,
          queueWaitDurationMsTotal: Number.isFinite(queueWaitMs) && queueWaitMs >= 0 ? Math.round(queueWaitMs) : 0,
          queueWaitDurationSamples: Number.isFinite(queueWaitMs) && queueWaitMs >= 0 ? 1 : 0
        }
      });
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return;
    }
    await workerLogger.warn("Failed to record worker analytics event", {
      eventType: input.eventType,
      itemId: input.itemId,
      userId: input.userId,
      dedupeKey: input.dedupeKey,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
