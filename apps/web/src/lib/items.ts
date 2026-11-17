import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AppError,
  buildUserItemMarkdownStorageKey,
  canonicalizeFetchableUrl,
  cleanExtractedMarkdown,
  errorCodes,
  extractHtmlFromUrlWithDiagnostics,
  extractHtmlSnapshot,
  extractTextFromPdf,
  hasNarratableText,
  lowSignalExtractionMessage,
  markdownToNarrationText,
  normalizeStorageKey,
  resolveEpisodeTitle,
  resolvePodcastTranscript,
  serializeItemTags,
  summarizeHtmlExtractionSelection,
  type HtmlExtractionSelectionDiagnostics,
  type ItemJobKind,
  type ItemProcessingMode,
} from "@articlepod/core";
import {
  recordAnalyticsEventBestEffort,
  resolveUserAnalyticsProfile,
} from "./admin-analytics/events";
import { env } from "./env";
import {
  enqueueItemDispatchMessage,
  webUsesPrismaDispatchQueue,
} from "./item-dispatch-queue";
import { logger } from "./logger";
import { prisma } from "./prisma";
import {
  consumeSubmissionCredit,
  PAID_SUBMISSION_DEFERRED_CODE,
} from "./submission-quota";
import { syncQueueProjectionFromEnqueue } from "./metadata-projection";
import { webPrimaryStore } from "./metadata-primary-store";
import { getArtifactStorage, isLikelyLegacyAbsolutePath } from "./storage";

export type EnqueueItemSourceType =
  | "URL"
  | "PDF"
  | "HTML_SNAPSHOT"
  | "PODCAST_TRANSCRIPT";

async function resolveItemProcessingMode(
  userId: string,
  mode?: "full" | "summary",
  sourceType?: EnqueueItemSourceType,
): Promise<ItemProcessingMode> {
  if (sourceType === "PODCAST_TRANSCRIPT") {
    return "SUMMARY_ONLY";
  }
  if (mode === "summary") {
    return "SUMMARY_ONLY";
  }
  if (mode === "full") {
    return "FULL_EPISODE";
  }

  if (env.metadataPrimaryBackend === "azure_table" && webPrimaryStore) {
    const user = await webPrimaryStore.findUserById(userId);
    return user?.defaultItemProcessingMode === "SUMMARY_ONLY"
      ? "SUMMARY_ONLY"
      : "FULL_EPISODE";
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultItemProcessingMode: true },
  });
  return user?.defaultItemProcessingMode === "SUMMARY_ONLY"
    ? "SUMMARY_ONLY"
    : "FULL_EPISODE";
}

function buildPersistedHtmlExtractionSelection(
  diagnostics: HtmlExtractionSelectionDiagnostics,
) {
  const summary = summarizeHtmlExtractionSelection(diagnostics);
  return {
    extractionEngine: summary.selectedEngine,
    extractionSelectionMode: summary.selectionMode,
    extractionScoreMargin: summary.scoreMargin,
    extractionSummaryJson: JSON.stringify(summary),
    extractionSelectionRecordedAt: new Date(),
  };
}

function safeProcessingError(error: unknown): {
  code: string;
  message: string;
} {
  if (error instanceof AppError) {
    return { code: error.code, message: error.userMessage };
  }
  return {
    code: errorCodes.EXTRACTION_FAILED,
    message:
      "Could not read this source. Retry once, or try another URL/PDF if it keeps failing.",
  };
}

async function extractSummarySource(input: {
  itemId: string;
  sourceType: EnqueueItemSourceType;
  sourceUrl?: string | null;
  sourceFilePath?: string | null;
  sourceHtml?: string | null;
}) {
  if (input.sourceType === "PODCAST_TRANSCRIPT") {
    if (!input.sourceUrl) {
      throw new AppError(errorCodes.INVALID_INPUT, "Missing podcast transcript URL", 400);
    }
    const transcript = await resolvePodcastTranscript({
      url: input.sourceUrl,
      html: input.sourceHtml,
    });
    return {
      title: transcript.title,
      markdown: transcript.markdown,
      sourceArtifact: null,
      selectionDiagnostics: null,
    };
  }

  if (input.sourceType === "URL") {
    if (!input.sourceUrl) {
      throw new AppError(errorCodes.INVALID_INPUT, "Missing source URL", 400);
    }
    const canonicalized = await canonicalizeFetchableUrl(input.sourceUrl);
    const pinnedCandidates =
      canonicalized.resolvedIps && canonicalized.resolvedIps.length > 0
        ? canonicalized.resolvedIps
        : canonicalized.resolvedIp
          ? [canonicalized.resolvedIp]
          : [];
    const extracted = await extractHtmlFromUrlWithDiagnostics(
      canonicalized.canonicalUrl,
      pinnedCandidates,
    );
    return {
      title: extracted.title ?? "",
      markdown: extracted.markdown,
      sourceArtifact: {
        kind: "RAW_HTML" as const,
        storageKey: normalizeStorageKey(
          join("items", input.itemId, "artifacts", "source.html"),
        ),
        contentType: "text/html; charset=utf-8",
        bytes: Buffer.from(extracted.rawHtml, "utf8"),
      },
      selectionDiagnostics: extracted.selectionDiagnostics,
    };
  }

  if (input.sourceType === "HTML_SNAPSHOT") {
    let snapshotHtml = input.sourceHtml?.trim() ?? "";
    if (!snapshotHtml && input.sourceFilePath) {
      snapshotHtml = isLikelyLegacyAbsolutePath(input.sourceFilePath)
        ? (await readFile(input.sourceFilePath, "utf8")).trim()
        : (
            await getArtifactStorage().getObject(
              normalizeStorageKey(input.sourceFilePath),
            )
          )
            .toString("utf8")
            .trim();
    }
    if (!snapshotHtml) {
      throw new AppError(
        errorCodes.INVALID_INPUT,
        "Missing captured HTML snapshot",
        400,
      );
    }
    const extracted = extractHtmlSnapshot({
      html: snapshotHtml,
      url: input.sourceUrl || undefined,
    });
    return {
      title: extracted.title ?? "",
      markdown: extracted.markdown,
      sourceArtifact: {
        kind: "RAW_HTML" as const,
        storageKey: normalizeStorageKey(
          join("items", input.itemId, "artifacts", "source.html"),
        ),
        contentType: "text/html; charset=utf-8",
        bytes: Buffer.from(extracted.rawHtml, "utf8"),
      },
      selectionDiagnostics: extracted.selectionDiagnostics,
    };
  }

  if (!input.sourceFilePath) {
    throw new AppError(
      errorCodes.INVALID_INPUT,
      "Missing source PDF path",
      400,
    );
  }
  const pdfData = isLikelyLegacyAbsolutePath(input.sourceFilePath)
    ? await readFile(input.sourceFilePath)
    : await getArtifactStorage().getObject(
        normalizeStorageKey(input.sourceFilePath),
      );
  const extracted = await extractTextFromPdf(new Uint8Array(pdfData));
  return {
    title: extracted.title ?? "",
    markdown: extracted.markdown,
    sourceArtifact: {
      kind: "RAW_PDF" as const,
      storageKey: normalizeStorageKey(
        join("items", input.itemId, "artifacts", "source.pdf"),
      ),
      contentType: "application/pdf",
      bytes: pdfData,
    },
    selectionDiagnostics: null,
  };
}

export async function materializeSummaryMarkdown(input: {
  itemId: string;
  userId: string;
  title?: string | null;
  sourceType: EnqueueItemSourceType;
  sourceUrl?: string | null;
  sourceFilePath?: string | null;
  sourceHtml?: string | null;
}) {
  try {
    const extracted = await extractSummarySource(input);
    const cleanedMarkdown = cleanExtractedMarkdown(extracted.markdown);
    const narrationText = markdownToNarrationText(cleanedMarkdown);
    if (!hasNarratableText(narrationText)) {
      throw new AppError(
        errorCodes.EXTRACTION_EMPTY,
        lowSignalExtractionMessage,
        400,
      );
    }
    const resolvedTitle =
      input.title?.trim() ||
      resolveEpisodeTitle(extracted.title, narrationText);
    const storage = getArtifactStorage();
    const rawStored = extracted.sourceArtifact
      ? await storage.putObject(
          extracted.sourceArtifact.storageKey,
          extracted.sourceArtifact.bytes,
          {
            contentType: extracted.sourceArtifact.contentType,
          },
        )
      : null;
    const markdownStored = await storage.putObject(
      buildUserItemMarkdownStorageKey(input.userId, input.itemId),
      Buffer.from(cleanedMarkdown, "utf8"),
      { contentType: "text/markdown; charset=utf-8" },
    );
    const extractionSelection = extracted.selectionDiagnostics
      ? buildPersistedHtmlExtractionSelection(extracted.selectionDiagnostics)
      : {};

    if (env.metadataPrimaryBackend === "azure_table" && webPrimaryStore) {
      if (extracted.sourceArtifact && rawStored) {
        await webPrimaryStore.upsertItemArtifact({
          id: randomUUID(),
          itemId: input.itemId,
          kind: extracted.sourceArtifact.kind,
          storageKey: rawStored.key,
          contentType: extracted.sourceArtifact.contentType,
          byteLength: rawStored.bytes,
          expiresAt: null,
        });
      }
      await webPrimaryStore.upsertItemArtifact({
        id: randomUUID(),
        itemId: input.itemId,
        kind: "MARKDOWN",
        storageKey: markdownStored.key,
        contentType: "text/markdown; charset=utf-8",
        byteLength: markdownStored.bytes,
        expiresAt: null,
      });
      await webPrimaryStore.updateItem(input.itemId, {
        title: resolvedTitle,
        status: "QUEUED",
        summaryStatus: "PROCESSING",
        errorCode: null,
        errorMessage: null,
        summaryErrorCode: null,
        summaryErrorMessage: null,
        sourceHtml: input.sourceType === "HTML_SNAPSHOT" ? null : undefined,
        ...extractionSelection,
      });
    } else {
      await prisma.$transaction(async (tx) => {
        if (extracted.sourceArtifact && rawStored) {
          await tx.itemArtifact.upsert({
            where: {
              itemId_kind: {
                itemId: input.itemId,
                kind: extracted.sourceArtifact.kind,
              },
            },
            update: {
              storageKey: rawStored.key,
              contentType: extracted.sourceArtifact.contentType,
              byteLength: rawStored.bytes,
              expiresAt: null,
            },
            create: {
              itemId: input.itemId,
              kind: extracted.sourceArtifact.kind,
              storageKey: rawStored.key,
              contentType: extracted.sourceArtifact.contentType,
              byteLength: rawStored.bytes,
              expiresAt: null,
            },
          });
        }
        await tx.itemArtifact.upsert({
          where: {
            itemId_kind: {
              itemId: input.itemId,
              kind: "MARKDOWN",
            },
          },
          update: {
            storageKey: markdownStored.key,
            contentType: "text/markdown; charset=utf-8",
            byteLength: markdownStored.bytes,
            expiresAt: null,
          },
          create: {
            itemId: input.itemId,
            kind: "MARKDOWN",
            storageKey: markdownStored.key,
            contentType: "text/markdown; charset=utf-8",
            byteLength: markdownStored.bytes,
            expiresAt: null,
          },
        });
        await tx.item.update({
          where: { id: input.itemId },
          data: {
            title: resolvedTitle,
            status: "QUEUED",
            summaryStatus: "PROCESSING",
            errorCode: null,
            errorMessage: null,
            summaryErrorCode: null,
            summaryErrorMessage: null,
            sourceHtml: input.sourceType === "HTML_SNAPSHOT" ? null : undefined,
            ...extractionSelection,
          },
        });
      });
    }
    return {
      ok: true as const,
      title: resolvedTitle,
      markdownBytes: markdownStored.bytes,
    };
  } catch (error) {
    const safe = safeProcessingError(error);
    if (env.metadataPrimaryBackend === "azure_table" && webPrimaryStore) {
      await webPrimaryStore.updateItem(input.itemId, {
        status: "FAILED",
        errorCode: safe.code,
        errorMessage: safe.message,
        summaryStatus: "FAILED",
        summaryErrorCode: safe.code,
        summaryErrorMessage: safe.message,
      });
    } else {
      await prisma.item.update({
        where: { id: input.itemId },
        data: {
          status: "FAILED",
          errorCode: safe.code,
          errorMessage: safe.message,
          summaryStatus: "FAILED",
          summaryErrorCode: safe.code,
          summaryErrorMessage: safe.message,
        },
      });
    }
    await logger.warn("Summary-mode markdown materialization failed", {
      itemId: input.itemId,
      userId: input.userId,
      errorCode: safe.code,
      error:
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error),
    });
    return { ok: false as const };
  }
}

export async function enqueueItem(input: {
  userId: string;
  title?: string;
  importance?: string;
  tags?: string[];
  mode?: "full" | "summary";
  sourceType: EnqueueItemSourceType;
  sourceUrl?: string;
  sourceFilePath?: string;
  sourceHtml?: string;
  sourceCapturedAt?: Date;
}) {
  const processingMode = await resolveItemProcessingMode(
    input.userId,
    input.mode,
    input.sourceType,
  );
  const jobKind: ItemJobKind =
    processingMode === "SUMMARY_ONLY" ? "SUMMARY_ONLY" : "FULL_EPISODE";
  let submissionOutcome: Awaited<
    ReturnType<typeof consumeSubmissionCredit>
  > | null = null;
  if (env.metadataPrimaryBackend === "azure_table" && webPrimaryStore) {
    submissionOutcome = await consumeSubmissionCredit({
      userId: input.userId,
      jobKind,
    });
  }
  const initialQueueMode = submissionOutcome?.queueMode ?? "IMMEDIATE";
  const initialScheduledFor = submissionOutcome?.scheduledFor ?? new Date();
  const initialAcceptedMessage = submissionOutcome?.acceptedMessage ?? null;
  const initialDeferredErrorCode =
    initialQueueMode === "DEFERRED" ? PAID_SUBMISSION_DEFERRED_CODE : null;

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
            processingMode,
            summaryStatus:
              processingMode === "SUMMARY_ONLY"
                ? "PROCESSING"
                : "NOT_REQUESTED",
            errorCode: initialDeferredErrorCode,
            errorMessage: initialAcceptedMessage,
          });
          if (processingMode === "SUMMARY_ONLY") {
            return {
              ...createdItem,
              jobs: [],
            };
          }
          const createdJob = await webPrimaryStore.createJob({
            id: randomUUID(),
            itemId: createdItem.id,
            userId: input.userId,
            jobKind,
            status: "QUEUED",
            nextRetryAt:
              initialQueueMode === "DEFERRED" ? initialScheduledFor : null,
            scheduledFor: initialScheduledFor,
            errorCode: initialDeferredErrorCode,
            errorMessage: initialAcceptedMessage,
          });
          try {
            const dispatchMessage = await enqueueItemDispatchMessage({
              jobId: createdJob.id,
              visibleAt: initialScheduledFor,
            });
            await webPrimaryStore.updateJob(createdJob.id, {
              dispatchMessageId: dispatchMessage.messageId,
            });
            createdJob.dispatchMessageId = dispatchMessage.messageId;
          } catch (error) {
            await logger.warn(
              "Item dispatch enqueue failed; leaving job for reconciliation",
              {
                itemId: createdItem.id,
                jobId: createdJob.id,
                error:
                  error instanceof Error
                    ? `${error.name}: ${error.message}`
                    : String(error),
              },
            );
          }
          return {
            ...createdItem,
            jobs: [createdJob],
          };
        })()
      : await prisma.$transaction(async (tx) => {
          submissionOutcome = await consumeSubmissionCredit({
            userId: input.userId,
            jobKind,
            tx,
          });
          const queueMode = submissionOutcome.queueMode;
          const scheduledFor = submissionOutcome.scheduledFor;
          const acceptedMessage = submissionOutcome.acceptedMessage;
          const deferredErrorCode =
            queueMode === "DEFERRED" ? PAID_SUBMISSION_DEFERRED_CODE : null;

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
                  errorMessage: true,
                },
                take: 1,
              },
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
              processingMode,
              summaryStatus:
                processingMode === "SUMMARY_ONLY"
                  ? "PROCESSING"
                  : "NOT_REQUESTED",
              errorCode: deferredErrorCode,
              errorMessage: acceptedMessage,
              ...(processingMode === "SUMMARY_ONLY"
                ? {}
                : {
                    jobs: {
                      create: {
                        jobKind,
                        status: "QUEUED",
                        nextRetryAt:
                          queueMode === "DEFERRED" ? scheduledFor : null,
                        scheduledFor,
                        errorCode: deferredErrorCode,
                        errorMessage: acceptedMessage,
                      },
                    },
                  }),
            },
          });

          const createdJob = createdItem.jobs[0];
          if (createdJob && webUsesPrismaDispatchQueue()) {
            const dispatchMessage = await enqueueItemDispatchMessage({
              jobId: createdJob.id,
              visibleAt: scheduledFor,
              client: tx,
            });
            await tx.job.update({
              where: { id: createdJob.id },
              data: {
                dispatchMessageId: dispatchMessage.messageId,
              },
            });
            createdJob.dispatchMessageId = dispatchMessage.messageId;
          }

          return createdItem;
        });

  if (processingMode === "SUMMARY_ONLY") {
    const taskQueueMode = submissionOutcome?.queueMode ?? initialQueueMode;
    const taskScheduledFor =
      submissionOutcome?.scheduledFor ?? initialScheduledFor;
    const taskAcceptedMessage =
      submissionOutcome?.acceptedMessage ?? initialAcceptedMessage;
    const taskDeferredErrorCode =
      taskQueueMode === "DEFERRED" ? PAID_SUBMISSION_DEFERRED_CODE : null;
    const materialized = await materializeSummaryMarkdown({
      itemId: item.id,
      userId: item.userId,
      title: item.title,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      sourceFilePath: input.sourceFilePath,
      sourceHtml: input.sourceHtml,
    });
    if (materialized.ok) {
      if (env.metadataPrimaryBackend === "azure_table" && webPrimaryStore) {
        await webPrimaryStore.createArticleSummaryTask({
          id: randomUUID(),
          itemId: item.id,
          userId: input.userId,
          status: "QUEUED",
          scheduledFor: taskScheduledFor,
          nextRetryAt: taskQueueMode === "DEFERRED" ? taskScheduledFor : null,
          errorCode: taskDeferredErrorCode,
          errorMessage: taskAcceptedMessage,
        });
      } else {
        await prisma.articleSummaryTask.create({
          data: {
            itemId: item.id,
            userId: input.userId,
            status: "QUEUED",
            scheduledFor: taskScheduledFor,
            nextRetryAt: taskQueueMode === "DEFERRED" ? taskScheduledFor : null,
            errorCode: taskDeferredErrorCode,
            errorMessage: taskAcceptedMessage,
          },
        });
      }
    }
  }

  if (!webUsesPrismaDispatchQueue()) {
    const createdJob = item.jobs[0];
    if (createdJob && !createdJob.dispatchMessageId) {
      try {
        const dispatchMessage = await enqueueItemDispatchMessage({
          jobId: createdJob.id,
          visibleAt: initialScheduledFor,
        });
        if (env.metadataPrimaryBackend === "azure_table" && webPrimaryStore) {
          await webPrimaryStore.updateJob(createdJob.id, {
            dispatchMessageId: dispatchMessage.messageId,
          });
        } else {
          await prisma.job.update({
            where: { id: createdJob.id },
            data: {
              dispatchMessageId: dispatchMessage.messageId,
            },
          });
        }
        createdJob.dispatchMessageId = dispatchMessage.messageId;
      } catch (error) {
        await logger.warn(
          "Item dispatch enqueue failed after item creation; leaving job for reconciliation",
          {
            itemId: item.id,
            jobId: createdJob.id,
            error:
              error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error),
          },
        );
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
      source_type: input.sourceType,
    },
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
        errorMessage: item.errorMessage,
      },
      job: createdJob,
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
    scheduledFor: submissionOutcome.scheduledFor,
  };
}
