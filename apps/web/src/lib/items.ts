import { randomUUID } from "node:crypto";
import { serializeItemTags } from "@articlepod/core";
import { recordAnalyticsEventBestEffort, resolveUserAnalyticsProfile } from "./admin-analytics/events";
import { env } from "./env";
import { enqueueItemDispatchMessage, webUsesPrismaDispatchQueue } from "./item-dispatch-queue";
import { logger } from "./logger";
import { prisma } from "./prisma";
import { consumeSubmissionCredit, PAID_SUBMISSION_DEFERRED_CODE } from "./submission-quota";
import { syncQueueProjectionFromEnqueue } from "./metadata-projection";
import { webPrimaryStore } from "./metadata-primary-store";

export async function enqueueItem(input: {
  userId: string;
  title?: string;
  importance?: string;
  tags?: string[];
  sourceType: "URL" | "PDF" | "HTML_SNAPSHOT";
  sourceUrl?: string;
  sourceFilePath?: string;
  sourceHtml?: string;
  sourceCapturedAt?: Date;
}) {
  let submissionOutcome: Awaited<ReturnType<typeof consumeSubmissionCredit>> | null = null;
  if (env.metadataPrimaryBackend === "azure_table" && webPrimaryStore) {
    submissionOutcome = await consumeSubmissionCredit({
      userId: input.userId
    });
  }
  const initialQueueMode = submissionOutcome?.queueMode ?? "IMMEDIATE";
  const initialScheduledFor = submissionOutcome?.scheduledFor ?? new Date();
  const initialAcceptedMessage = submissionOutcome?.acceptedMessage ?? null;
  const initialDeferredErrorCode = initialQueueMode === "DEFERRED" ? PAID_SUBMISSION_DEFERRED_CODE : null;

  const item =
    env.metadataPrimaryBackend === "azure_table" && webPrimaryStore
      ? await (async () => {
          const createdItem = await webPrimaryStore.createItem({
            id: randomUUID(),
            userId: input.userId,
            title: input.title,
            priority: input.importance ?? "LOW",
            tags: input.tags ?? [],
            sourceType: input.sourceType,
            sourceUrl: input.sourceUrl,
            sourceFilePath: input.sourceFilePath,
            sourceHtml: input.sourceHtml,
            sourceCapturedAt: input.sourceCapturedAt,
            status: "QUEUED",
            errorCode: initialDeferredErrorCode,
            errorMessage: initialAcceptedMessage
          });
          const createdJob = await webPrimaryStore.createJob({
            id: randomUUID(),
            itemId: createdItem.id,
            userId: input.userId,
            status: "QUEUED",
            nextRetryAt: initialQueueMode === "DEFERRED" ? initialScheduledFor : null,
            scheduledFor: initialScheduledFor,
            errorCode: initialDeferredErrorCode,
            errorMessage: initialAcceptedMessage
          });
          try {
            const dispatchMessage = await enqueueItemDispatchMessage({
              jobId: createdJob.id,
              visibleAt: initialScheduledFor
            });
            await webPrimaryStore.updateJob(createdJob.id, {
              dispatchMessageId: dispatchMessage.messageId
            });
            createdJob.dispatchMessageId = dispatchMessage.messageId;
          } catch (error) {
            await logger.warn("Item dispatch enqueue failed; leaving job for reconciliation", {
              itemId: createdItem.id,
              jobId: createdJob.id,
              error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
            });
          }
          return {
            ...createdItem,
            jobs: [createdJob]
          };
        })()
      : await prisma.$transaction(async (tx) => {
          submissionOutcome = await consumeSubmissionCredit({
            userId: input.userId,
            tx
          });
          const queueMode = submissionOutcome.queueMode;
          const scheduledFor = submissionOutcome.scheduledFor;
          const acceptedMessage = submissionOutcome.acceptedMessage;
          const deferredErrorCode = queueMode === "DEFERRED" ? PAID_SUBMISSION_DEFERRED_CODE : null;

          const createdItem = await tx.item.create({
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
                  leaseId: true,
                  leaseOwner: true,
                  leaseExpiresAt: true,
                  lastHeartbeatAt: true,
                  dispatchMessageId: true,
                  scheduledFor: true,
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
              priority: input.importance ?? "LOW",
              tagsJson: serializeItemTags(input.tags),
              sourceType: input.sourceType,
              sourceUrl: input.sourceUrl,
              sourceFilePath: input.sourceFilePath,
              sourceHtml: input.sourceHtml,
              sourceCapturedAt: input.sourceCapturedAt,
              status: "QUEUED",
              errorCode: deferredErrorCode,
              errorMessage: acceptedMessage,
              jobs: {
                create: {
                  status: "QUEUED",
                  nextRetryAt: queueMode === "DEFERRED" ? scheduledFor : null,
                  scheduledFor,
                  errorCode: deferredErrorCode,
                  errorMessage: acceptedMessage
                }
              }
            }
          });

          const createdJob = createdItem.jobs[0];
          if (createdJob && webUsesPrismaDispatchQueue()) {
            const dispatchMessage = await enqueueItemDispatchMessage({
              jobId: createdJob.id,
              visibleAt: scheduledFor,
              client: tx
            });
            await tx.job.update({
              where: { id: createdJob.id },
              data: {
                dispatchMessageId: dispatchMessage.messageId
              }
            });
            createdJob.dispatchMessageId = dispatchMessage.messageId;
          }

          return createdItem;
        });

  if (!webUsesPrismaDispatchQueue()) {
    const createdJob = item.jobs[0];
    if (createdJob && !createdJob.dispatchMessageId) {
      try {
        const dispatchMessage = await enqueueItemDispatchMessage({
          jobId: createdJob.id,
          visibleAt: initialScheduledFor
        });
        if (env.metadataPrimaryBackend === "azure_table" && webPrimaryStore) {
          await webPrimaryStore.updateJob(createdJob.id, {
            dispatchMessageId: dispatchMessage.messageId
          });
        } else {
          await prisma.job.update({
            where: { id: createdJob.id },
            data: {
              dispatchMessageId: dispatchMessage.messageId
            }
          });
        }
        createdJob.dispatchMessageId = dispatchMessage.messageId;
      } catch (error) {
        await logger.warn("Item dispatch enqueue failed after item creation; leaving job for reconciliation", {
          itemId: item.id,
          jobId: createdJob.id,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        });
      }
    }
  }

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

  if (!submissionOutcome) {
    throw new Error("Missing submission quota outcome");
  }

  return {
    item,
    submissionQuota: submissionOutcome.snapshot,
    queueMode: submissionOutcome.queueMode,
    acceptedMessage: submissionOutcome.acceptedMessage,
    scheduledFor: submissionOutcome.scheduledFor
  };
}
