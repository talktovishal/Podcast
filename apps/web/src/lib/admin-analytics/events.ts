import {
  buildAnalyticsSegmentKey,
  toAnalyticsDay,
  type AnalyticsAuthMethod,
  type AnalyticsSegmentAuth,
  type AnalyticsUserRole
} from "@articlepod/core";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { RecordAnalyticsEventInput } from "./types";

type UserAnalyticsProfile = {
  authMethod: AnalyticsAuthMethod;
  segmentAuth: AnalyticsSegmentAuth;
  userRole: AnalyticsUserRole;
};

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function mapRole(role: string | null | undefined): AnalyticsUserRole {
  return role === "ADMIN" ? "ADMIN" : "USER";
}

export async function resolveUserAnalyticsProfile(userId: string): Promise<UserAnalyticsProfile> {
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
    return { authMethod: "LOCAL", segmentAuth: "LOCAL_ONLY", userRole: "USER" };
  }

  const providers = new Set(user.oauthIdentities.map((identity) => identity.provider.toLowerCase()));
  if (providers.size === 0) {
    return { authMethod: "LOCAL", segmentAuth: "LOCAL_ONLY", userRole: mapRole(user.role) };
  }
  if (providers.size === 1 && providers.has("google")) {
    return { authMethod: "GOOGLE", segmentAuth: "OAUTH_LINKED", userRole: mapRole(user.role) };
  }
  if (providers.size === 1 && providers.has("apple")) {
    return { authMethod: "APPLE", segmentAuth: "OAUTH_LINKED", userRole: mapRole(user.role) };
  }
  return { authMethod: "OAUTH_LINKED", segmentAuth: "OAUTH_LINKED", userRole: mapRole(user.role) };
}

function buildRollupUpdate(input: {
  eventType: RecordAnalyticsEventInput["eventType"];
  metadata: Record<string, unknown> | null;
}): Prisma.AnalyticsDailyRollupUpdateInput {
  const update: Prisma.AnalyticsDailyRollupUpdateInput = {};

  if (input.eventType === "USER_SIGNUP") {
    update.signups = { increment: 1 };
  } else if (input.eventType === "USER_LOGIN") {
    update.logins = { increment: 1 };
  } else if (input.eventType === "ITEM_SUBMITTED") {
    update.submissions = { increment: 1 };
  } else if (input.eventType === "ITEM_READY") {
    update.ready = { increment: 1 };
  } else if (input.eventType === "ITEM_FAILED") {
    update.failed = { increment: 1 };
  } else if (input.eventType === "PLAYBACK_STARTED") {
    update.playbackStarts = { increment: 1 };
  }

  const queueWaitMs = Number(input.metadata?.queue_wait_ms ?? NaN);
  const processingDurationMs = Number(input.metadata?.processing_duration_ms ?? NaN);

  if (Number.isFinite(queueWaitMs) && queueWaitMs >= 0) {
    update.queueWaitDurationMsTotal = { increment: Math.round(queueWaitMs) };
    update.queueWaitDurationSamples = { increment: 1 };
  }
  if (Number.isFinite(processingDurationMs) && processingDurationMs >= 0) {
    update.processingDurationMsTotal = { increment: Math.round(processingDurationMs) };
    update.processingDurationSamples = { increment: 1 };
  }

  return update;
}

export async function recordAnalyticsEvent(input: RecordAnalyticsEventInput): Promise<boolean> {
  const occurredAt = input.occurredAt ?? new Date();
  const day = toAnalyticsDay(occurredAt);
  const metadata = input.metadata ?? null;

  const profile =
    input.userId && (!input.authMethod || !input.segmentAuth || !input.userRole)
      ? await resolveUserAnalyticsProfile(input.userId)
      : null;

  const authMethod = input.authMethod ?? profile?.authMethod ?? null;
  const segmentAuth = input.segmentAuth ?? profile?.segmentAuth ?? null;
  const userRole = input.userRole ?? profile?.userRole ?? null;
  const segmentKey = buildAnalyticsSegmentKey({
    sourceType: input.sourceType ?? null,
    authMethod,
    userRole
  });

  const rollupUpdate = buildRollupUpdate({
    eventType: input.eventType,
    metadata
  });
  const rollupCreate = {
    day,
    segmentKey,
    signups: input.eventType === "USER_SIGNUP" ? 1 : 0,
    logins: input.eventType === "USER_LOGIN" ? 1 : 0,
    submissions: input.eventType === "ITEM_SUBMITTED" ? 1 : 0,
    ready: input.eventType === "ITEM_READY" ? 1 : 0,
    failed: input.eventType === "ITEM_FAILED" ? 1 : 0,
    playbackStarts: input.eventType === "PLAYBACK_STARTED" ? 1 : 0,
    processingDurationMsTotal: Math.max(0, Number(metadata?.processing_duration_ms ?? 0) || 0),
    processingDurationSamples: Number.isFinite(Number(metadata?.processing_duration_ms ?? NaN)) ? 1 : 0,
    queueWaitDurationMsTotal: Math.max(0, Number(metadata?.queue_wait_ms ?? 0) || 0),
    queueWaitDurationSamples: Number.isFinite(Number(metadata?.queue_wait_ms ?? NaN)) ? 1 : 0
  };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.analyticsEvent.create({
        data: {
          eventType: input.eventType,
          occurredAt,
          day,
          userId: input.userId ?? null,
          itemId: input.itemId ?? null,
          sourceType: input.sourceType ?? null,
          authMethod,
          userRole,
          segmentAuth,
          metadataJson: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
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
        update: rollupUpdate,
        create: rollupCreate
      });
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return false;
    }
    throw error;
  }
}

export async function recordAnalyticsEventBestEffort(input: RecordAnalyticsEventInput): Promise<void> {
  try {
    await recordAnalyticsEvent(input);
  } catch (error) {
    await logger.warn("Failed to record analytics event", {
      eventType: input.eventType,
      dedupeKey: input.dedupeKey,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
