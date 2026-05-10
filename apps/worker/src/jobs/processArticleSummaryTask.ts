import { randomUUID } from "node:crypto";
import {
  AppError,
  buildUserItemSummaryStorageKey,
  digestTargetWords,
  errorCodes,
  toSummaryRunUserMessage,
  type DigestLengthMinutes
} from "@articlepod/core";
import type { Prisma } from "@prisma/client";
import { workerEnv } from "../lib/env.js";
import { workerLogger } from "../lib/logger.js";
import { workerPrimaryStore, workerUsesAzureTablePrimary } from "../lib/metadata-primary-store.js";
import { prisma } from "../lib/prisma.js";
import { makeSummaryProvider } from "../lib/summary.js";
import { getArtifactStorage } from "../lib/storage.js";

const MAX_ERROR_MESSAGE_LENGTH = 500;
const ITEM_SUMMARY_LENGTH_MINUTES: DigestLengthMinutes = 5;
const SUPPORTED_SUMMARY_SOURCE_TYPES = ["URL", "PDF", "HTML_SNAPSHOT", "PODCAST_TRANSCRIPT"] as const;

class LostArticleSummaryTaskLeaseError extends Error {}

function buildRetryAt(delayMs: number): Date {
  const jitter = Math.floor(Math.random() * 5_000);
  return new Date(Date.now() + delayMs + jitter);
}

function toSafeErrorMessage(input: unknown): string {
  let message = "";
  if (typeof input === "string") {
    message = input;
  } else if (input instanceof Error) {
    message = input.message;
  } else if (input === null || input === undefined) {
    message = "";
  } else {
    try {
      message = JSON.stringify(input);
    } catch {
      message = String(input);
    }
  }

  const normalized = message.trim() || "Summary processing failed unexpectedly. Please retry.";
  if (normalized.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_ERROR_MESSAGE_LENGTH - 3).trimEnd()}...`;
}

function mapSummaryError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError(errorCodes.INTERNAL_ERROR, "Summary processing failed unexpectedly. Please retry.", 500);
}

function isSupportedSourceType(sourceType: string): sourceType is (typeof SUPPORTED_SUMMARY_SOURCE_TYPES)[number] {
  return SUPPORTED_SUMMARY_SOURCE_TYPES.includes(sourceType as (typeof SUPPORTED_SUMMARY_SOURCE_TYPES)[number]);
}

async function reclaimStaleProcessingArticleSummaryTasks(): Promise<number> {
  const staleBefore = new Date(Date.now() - workerEnv.staleProcessingMs);
  if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
    const tasks = await workerPrimaryStore.listNextEligibleArticleSummaryTasks(new Date(), workerEnv.digestRunMaxRetryAttempts, 500);
    let reclaimed = 0;
    for (const task of tasks) {
      if (task.status !== "PROCESSING" || !task.lockedAt || task.lockedAt >= staleBefore) {
        continue;
      }
      const updated = await workerPrimaryStore.updateArticleSummaryTask(task.id, {
        status: "QUEUED",
        lockedAt: null,
        leaseId: null,
        leaseOwner: null,
        nextRetryAt: new Date()
      });
      if (updated) {
        reclaimed += 1;
      }
    }
    return reclaimed;
  }

  const staleTasks = await prisma.articleSummaryTask.findMany({
    where: {
      status: "PROCESSING",
      lockedAt: {
        lt: staleBefore
      }
    },
    select: { id: true }
  });

  let reclaimed = 0;
  for (const task of staleTasks) {
    const updated = await prisma.articleSummaryTask.updateMany({
      where: { id: task.id, status: "PROCESSING", lockedAt: { lt: staleBefore } },
      data: {
        status: "QUEUED",
        lockedAt: null,
        leaseId: null,
        leaseOwner: null,
        nextRetryAt: new Date()
      }
    });
    reclaimed += updated.count;
  }
  return reclaimed;
}

async function claimArticleSummaryTask(taskId: string, nowTs: Date) {
  const leaseId = randomUUID();
  if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
    const task = await workerPrimaryStore.findArticleSummaryTaskById(taskId);
    if (!task) {
      return null;
    }
    const isQueued = task.status === "QUEUED" && (!task.scheduledFor || task.scheduledFor <= nowTs);
    const isRetryable = task.status === "FAILED" && Boolean(task.nextRetryAt) && task.nextRetryAt! <= nowTs && task.attempt < workerEnv.digestRunMaxRetryAttempts;
    if (!isQueued && !isRetryable) {
      return null;
    }

    const claimed = await workerPrimaryStore.updateArticleSummaryTask(task.id, {
      status: "PROCESSING",
      attempt: task.attempt + 1,
      lockedAt: nowTs,
      leaseId,
      leaseOwner: workerEnv.workerInstanceId,
      errorCode: null,
      errorMessage: null
    });
    if (!claimed || claimed.leaseId !== leaseId) {
      return null;
    }
    const item = await workerPrimaryStore.findItemById(claimed.itemId);
    if (!item) {
      await workerPrimaryStore.deleteArticleSummaryTask(claimed.id);
      return null;
    }
    return { ...claimed, item };
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const task = await tx.articleSummaryTask.findFirst({
      where: {
        id: taskId,
        OR: [
          {
            status: "QUEUED",
            OR: [{ scheduledFor: null }, { scheduledFor: { lte: nowTs } }]
          },
          {
            status: "FAILED",
            nextRetryAt: { lte: nowTs },
            attempt: { lt: workerEnv.digestRunMaxRetryAttempts }
          }
        ]
      },
      include: {
        item: true
      }
    });

    if (!task) {
      return null;
    }

    const claimed = await tx.articleSummaryTask.updateMany({
      where: {
        id: task.id,
        status: task.status,
        attempt: task.attempt
      },
      data: {
        status: "PROCESSING",
        attempt: { increment: 1 },
        lockedAt: nowTs,
        leaseId,
        leaseOwner: workerEnv.workerInstanceId,
        errorCode: null,
        errorMessage: null
      }
    });
    if (claimed.count !== 1) {
      return null;
    }

    return tx.articleSummaryTask.findUnique({
      where: { id: task.id },
      include: { item: true }
    });
  });
}

export async function processArticleSummaryTask(taskId: string): Promise<boolean> {
  const claimResult = await claimArticleSummaryTask(taskId, new Date());
  if (!claimResult) {
    return false;
  }

  const storage = getArtifactStorage();
  const summaryProvider = makeSummaryProvider();

  try {
    const artifacts =
      workerUsesAzureTablePrimary() && workerPrimaryStore
        ? await workerPrimaryStore.listItemArtifacts(claimResult.itemId, "MARKDOWN")
        : await prisma.itemArtifact.findMany({
            where: { itemId: claimResult.itemId, kind: "MARKDOWN" },
            take: 1
          });
    const artifact = artifacts[0];
    if (!artifact) {
      throw new AppError(errorCodes.INVALID_INPUT, "No canonical markdown was available for this summary item.", 400);
    }

    const markdown = (await storage.getObject(artifact.storageKey)).toString("utf8");
    const sourceType = isSupportedSourceType(claimResult.item.sourceType) ? claimResult.item.sourceType : "URL";
    const title = claimResult.item.title?.trim() || "Saved item summary";
    const completedAt = new Date();
    const summary = await summaryProvider.summarize({
      kind: "item_summary",
      cadence: "DAILY",
      timezone: "UTC",
      periodKey: claimResult.itemId,
      windowStart: claimResult.item.createdAt,
      windowEnd: completedAt,
      targetLengthMinutes: ITEM_SUMMARY_LENGTH_MINUTES,
      targetWords: digestTargetWords(ITEM_SUMMARY_LENGTH_MINUTES),
      requestedTitle: title,
      sources: [
        {
          itemId: claimResult.itemId,
          title,
          sourceType,
          sourceUrl: claimResult.item.sourceUrl,
          createdAt: claimResult.item.createdAt,
          markdown
        }
      ]
    });

    const summaryStorageKey = buildUserItemSummaryStorageKey(claimResult.userId, claimResult.itemId);
    const storedSummary = await storage.putObject(summaryStorageKey, Buffer.from(summary.markdown, "utf8"), {
      contentType: "text/markdown; charset=utf-8"
    });

    if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
      const latest = await workerPrimaryStore.findArticleSummaryTaskById(claimResult.id);
      if (!latest || latest.leaseId !== claimResult.leaseId || latest.status !== "PROCESSING") {
        throw new LostArticleSummaryTaskLeaseError();
      }
      await workerPrimaryStore.updateItem(claimResult.itemId, {
        status: "READY",
        processingMode: "SUMMARY_ONLY",
        errorCode: null,
        errorMessage: null,
        summaryStatus: "SUCCEEDED",
        summaryTitle: summary.title,
        summaryStorageKey: storedSummary.key,
        summaryBytes: storedSummary.bytes,
        summaryProvider: summary.provider,
        summaryModel: summary.model,
        summaryDeployment: summary.deployment ?? null,
        summaryInputTokens: summary.inputTokens ?? null,
        summaryOutputTokens: summary.outputTokens ?? null,
        summaryErrorCode: null,
        summaryErrorMessage: null,
        summaryCompletedAt: completedAt
      });
      await workerPrimaryStore.deleteArticleSummaryTask(claimResult.id);
    } else {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const latest = await tx.articleSummaryTask.findFirst({
          where: {
            id: claimResult.id,
            leaseId: claimResult.leaseId,
            status: "PROCESSING"
          },
          select: { id: true }
        });
        if (!latest) {
          throw new LostArticleSummaryTaskLeaseError();
        }

        await tx.item.update({
          where: { id: claimResult.itemId },
          data: {
            status: "READY",
            processingMode: "SUMMARY_ONLY",
            errorCode: null,
            errorMessage: null,
            summaryStatus: "SUCCEEDED",
            summaryTitle: summary.title,
            summaryStorageKey: storedSummary.key,
            summaryBytes: storedSummary.bytes,
            summaryProvider: summary.provider,
            summaryModel: summary.model,
            summaryDeployment: summary.deployment ?? null,
            summaryInputTokens: summary.inputTokens ?? null,
            summaryOutputTokens: summary.outputTokens ?? null,
            summaryErrorCode: null,
            summaryErrorMessage: null,
            summaryCompletedAt: completedAt
          }
        });
        await tx.articleSummaryTask.delete({ where: { id: claimResult.id } });
      });
    }

    await workerLogger.info("Article summary task completed", {
      articleSummaryTaskId: claimResult.id,
      itemId: claimResult.itemId,
      sourceType,
      summaryProvider: summary.provider,
      summaryModel: summary.model
    });
    return true;
  } catch (error) {
    if (error instanceof LostArticleSummaryTaskLeaseError) {
      await workerLogger.warn("Article summary task lease lost", {
        articleSummaryTaskId: claimResult.id,
        itemId: claimResult.itemId
      });
      return false;
    }

    const mappedError = mapSummaryError(error);
    const retryRecommended = claimResult.attempt < workerEnv.digestRunMaxRetryAttempts;
    const safeErrorMessage = toSafeErrorMessage(toSummaryRunUserMessage(mappedError.userMessage, mappedError.code));

    if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
      const latest = await workerPrimaryStore.findArticleSummaryTaskById(claimResult.id);
      if (latest?.leaseId === claimResult.leaseId && latest.status === "PROCESSING") {
        await workerPrimaryStore.updateArticleSummaryTask(claimResult.id, {
          status: "FAILED",
          nextRetryAt: retryRecommended ? buildRetryAt(Math.max(30_000, workerEnv.retryPollMs)) : null,
          lockedAt: null,
          leaseId: null,
          leaseOwner: null,
          errorCode: mappedError.code,
          errorMessage: safeErrorMessage
        });
        await workerPrimaryStore.updateItem(claimResult.itemId, {
          status: "FAILED",
          errorCode: mappedError.code,
          errorMessage: safeErrorMessage,
          summaryStatus: "FAILED",
          summaryErrorCode: mappedError.code,
          summaryErrorMessage: safeErrorMessage
        });
      }
    } else {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const updated = await tx.articleSummaryTask.updateMany({
          where: {
            id: claimResult.id,
            leaseId: claimResult.leaseId,
            status: "PROCESSING"
          },
          data: {
            status: "FAILED",
            nextRetryAt: retryRecommended ? buildRetryAt(Math.max(30_000, workerEnv.retryPollMs)) : null,
            lockedAt: null,
            leaseId: null,
            leaseOwner: null,
            errorCode: mappedError.code,
            errorMessage: safeErrorMessage
          }
        });
        if (updated.count !== 1) {
          throw new LostArticleSummaryTaskLeaseError();
        }
        await tx.item.update({
          where: { id: claimResult.itemId },
          data: {
            status: "FAILED",
            errorCode: mappedError.code,
            errorMessage: safeErrorMessage,
            summaryStatus: "FAILED",
            summaryErrorCode: mappedError.code,
            summaryErrorMessage: safeErrorMessage
          }
        });
      }).catch((stateError) => {
        if (!(stateError instanceof LostArticleSummaryTaskLeaseError)) {
          throw stateError;
        }
      });
    }

    await workerLogger.errorWithCode({
      msg: "Article summary task failed",
      error_code: mappedError.code,
      attrs: {
        articleSummaryTaskId: claimResult.id,
        itemId: claimResult.itemId,
        retryRecommended,
        error: toSafeErrorMessage(error)
      }
    });
    return false;
  }
}

export async function processNextQueuedArticleSummaryTask(): Promise<boolean> {
  const reclaimed = await reclaimStaleProcessingArticleSummaryTasks();
  if (reclaimed > 0) {
    await workerLogger.warn("Reclaimed stale article summary tasks", { reclaimed });
  }

  if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
    const next = (await workerPrimaryStore.listNextEligibleArticleSummaryTasks(new Date(), workerEnv.digestRunMaxRetryAttempts, 1))[0];
    if (!next) {
      return false;
    }
    return processArticleSummaryTask(next.id);
  }

  const nextQueued = await prisma.articleSummaryTask.findFirst({
    where: {
      status: "QUEUED",
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }]
    },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }, { id: "asc" }]
  });
  if (nextQueued) {
    return processArticleSummaryTask(nextQueued.id);
  }

  const nextRetryable = await prisma.articleSummaryTask.findFirst({
    where: {
      status: "FAILED",
      nextRetryAt: { lte: new Date() },
      attempt: { lt: workerEnv.digestRunMaxRetryAttempts }
    },
    orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }, { id: "asc" }]
  });
  if (!nextRetryable) {
    return false;
  }
  return processArticleSummaryTask(nextRetryable.id);
}
