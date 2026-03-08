import { recordAnalyticsEventBestEffort, resolveUserAnalyticsProfile } from "./admin-analytics/events";
import { prisma } from "./prisma";
import { consumeSubmissionCredit } from "./submission-quota";
import { syncQueueProjectionFromEnqueue } from "./metadata-projection";

export async function enqueueItem(input: {
  userId: string;
  title?: string;
  sourceType: "URL" | "PDF" | "HTML_SNAPSHOT";
  sourceUrl?: string;
  sourceFilePath?: string;
  sourceHtml?: string;
  sourceCapturedAt?: Date;
}) {
  const item = await prisma.$transaction(async (tx) => {
    await consumeSubmissionCredit({
      userId: input.userId,
      tx
    });

    return tx.item.create({
      include: {
        jobs: {
          select: {
            id: true,
            itemId: true,
            status: true,
            attempt: true,
            createdAt: true,
            updatedAt: true,
            lockedAt: true,
            nextRetryAt: true,
            errorCode: true,
            errorMessage: true
          },
          take: 1
        }
      },
      data: {
        userId: input.userId,
        title: input.title,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl,
        sourceFilePath: input.sourceFilePath,
        sourceHtml: input.sourceHtml,
        sourceCapturedAt: input.sourceCapturedAt,
        status: "QUEUED",
        jobs: {
          create: {
            status: "QUEUED"
          }
        }
      }
    });
  });

  const profile = await resolveUserAnalyticsProfile(input.userId);
  await recordAnalyticsEventBestEffort({
    eventType: "ITEM_SUBMITTED",
    userId: input.userId,
    itemId: item.id,
    sourceType: input.sourceType,
    authMethod: profile.authMethod,
    segmentAuth: profile.segmentAuth,
    userRole: profile.userRole,
    dedupeKey: `item_submitted:${item.id}`,
    occurredAt: item.createdAt,
    metadata: {
      source_type: input.sourceType
    }
  });

  const createdJob = item.jobs[0];
  if (createdJob) {
    await syncQueueProjectionFromEnqueue({
      item: {
        id: item.id,
        userId: item.userId,
        sourceType: item.sourceType,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage
      },
      job: createdJob
    });
  }

  return item;
}
