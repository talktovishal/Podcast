import { recordAnalyticsEventBestEffort, resolveUserAnalyticsProfile } from "./admin-analytics/events";
import { prisma } from "./prisma";
import { consumeSubmissionCredit } from "./submission-quota";

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

  return item;
}
