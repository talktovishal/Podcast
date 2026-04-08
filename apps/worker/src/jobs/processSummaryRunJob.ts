import { join } from "node:path";
import {
  AppError,
  buildEpisodeDescription,
  chunkText,
  digestTargetWords,
  episodeAudioExpiryDate,
  errorCodes,
  normalizeTtsSelection,
  summaryMarkdownToNarrationText,
  toSummaryPodcastUserMessage,
  toSummaryRunUserMessage,
  type DigestLengthMinutes
} from "@articlepod/core";
import type { Prisma } from "@prisma/client";
import { workerEnv } from "../lib/env.js";
import { workerLogger } from "../lib/logger.js";
import { workerPrimaryStore, workerUsesAzureTablePrimary } from "../lib/metadata-primary-store.js";
import { prisma } from "../lib/prisma.js";
import { makeSummaryProvider } from "../lib/summary.js";
import { getArtifactStorage, normalizeStorageKey } from "../lib/storage.js";
import { synthesizeEpisodeAudio } from "./processItemJob.js";

const MAX_ERROR_MESSAGE_LENGTH = 500;

function buildRetryAt(delayMs: number): Date {
  const jitter = Math.floor(Math.random() * 5_000);
  return new Date(Date.now() + delayMs + jitter);
}

function normalizeLengthMinutes(value: number): DigestLengthMinutes {
  if (value === 5 || value === 15 || value === 30) {
    return value;
  }
  return 15;
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

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string" &&
      (error as { code: string }).code === code
  );
}

function isPrismaMissingEntityError(error: unknown): boolean {
  return isPrismaErrorCode(error, "P2025");
}

function summaryPeriodKey(windowStart: Date, windowEnd: Date, runId: string): string {
  const start = windowStart.toISOString().slice(0, 10);
  const end = windowEnd.toISOString().slice(0, 10);
  return `${start}_${end}_${runId}`;
}

async function reclaimStaleProcessingSummaryRuns(): Promise<number> {
  const staleBefore = new Date(Date.now() - workerEnv.staleProcessingMs);
  if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
    const staleRuns = await workerPrimaryStore.listStaleSummaryRuns(staleBefore);
    if (staleRuns.length === 0) {
      return 0;
    }
    let reclaimed = 0;
    for (const run of staleRuns) {
      const updated = await workerPrimaryStore.updateSummaryRun(run.id, {
        status: "QUEUED",
        lockedAt: null,
        nextRetryAt: new Date()
      });
      if (!updated) {
        continue;
      }
      reclaimed += 1;
    }
    return reclaimed;
  }

  const staleRuns = await prisma.summaryRun.findMany({
    where: {
      status: "PROCESSING",
      lockedAt: {
        lt: staleBefore
      }
    },
    select: {
      id: true
    }
  });

  let reclaimed = 0;
  for (const run of staleRuns) {
    try {
      await prisma.summaryRun.update({
        where: { id: run.id, status: "PROCESSING", lockedAt: { lt: staleBefore } },
        data: {
          status: "QUEUED",
          lockedAt: null,
          nextRetryAt: new Date()
        }
      });
      reclaimed += 1;
    } catch {
      // Another worker reclaimed it first.
    }
  }
  return reclaimed;
}

export async function processSummaryRun(runId: string): Promise<boolean> {
  const nowTs = new Date();
  const claimResult =
    workerUsesAzureTablePrimary() && workerPrimaryStore
      ? await (async () => {
          const claimed = await workerPrimaryStore.claimSummaryRun(runId, nowTs, workerEnv.digestRunMaxRetryAttempts);
          if (!claimed) {
            return null;
          }
          const user = await workerPrimaryStore.findUserById(claimed.userId);
          if (!user) {
            return null;
          }
          return {
            ...claimed,
            user: {
              id: user.id,
              ttsProvider: user.ttsProvider,
              ttsVoice: user.ttsVoice
            }
          };
        })()
      : await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const next = await tx.summaryRun.findFirst({
            where: {
              id: runId,
              OR: [
                { status: "QUEUED" },
                {
                  status: "FAILED",
                  nextRetryAt: { lte: nowTs },
                  attempt: { lt: workerEnv.digestRunMaxRetryAttempts }
                }
              ]
            },
            include: {
              user: {
                select: {
                  id: true,
                  ttsProvider: true,
                  ttsVoice: true
                }
              }
            }
          });

          if (!next) {
            return null;
          }

          return tx.summaryRun.update({
            where: { id: next.id },
            data: {
              status: "PROCESSING",
              lockedAt: new Date(),
              attempt: { increment: 1 },
              errorCode: null,
              errorMessage: null
            },
            include: {
              user: {
                select: {
                  id: true,
                  ttsProvider: true,
                  ttsVoice: true
                }
              }
            }
          });
        });

  if (!claimResult) {
    return false;
  }

  const storage = getArtifactStorage();
  const summaryProvider = makeSummaryProvider();

  try {
    const userSettings =
      workerUsesAzureTablePrimary() && workerPrimaryStore
        ? await workerPrimaryStore.findDigestSettingsByUserId(claimResult.userId)
        : await prisma.userDigestSettings.findUnique({
            where: { userId: claimResult.userId },
            select: { timezone: true }
          });

    const selectedItems =
      workerUsesAzureTablePrimary() && workerPrimaryStore
        ? await (async () => {
            const store = workerPrimaryStore;
            const selections = await store.listSummaryRunItems(claimResult.id);
            const hydrated = await Promise.all(
              selections.map(async (selection) => {
                const item = await store.findItemById(selection.itemId);
                if (!item) {
                  return null;
                }
                const artifacts = await store.listItemArtifacts(selection.itemId, "MARKDOWN");
                return {
                  selection,
                  item,
                  artifacts
                };
              })
            );
            return hydrated.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
          })()
        : await prisma.summaryRunItem.findMany({
            where: { summaryRunId: claimResult.id },
            orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
            include: {
              item: {
                include: {
                  artifacts: {
                    where: { kind: "MARKDOWN" },
                    take: 1
                  }
                }
              }
            }
          });

    const sources = (
      await Promise.all(
        selectedItems.map(async (selectionRow) => {
          const item = selectionRow.item;
          const artifacts = "artifacts" in selectionRow ? selectionRow.artifacts : selectionRow.item.artifacts;
          const artifact = artifacts[0];
          if (!artifact) {
            return null;
          }

          const markdown = (await storage.getObject(artifact.storageKey)).toString("utf8");
          return {
            itemId: item.id,
            title: item.title,
            sourceType: (item.sourceType === "URL" || item.sourceType === "PDF" || item.sourceType === "HTML_SNAPSHOT"
              ? item.sourceType
              : "URL") as "URL" | "PDF" | "HTML_SNAPSHOT",
            sourceUrl: item.sourceUrl,
            createdAt: item.createdAt,
            markdown
          };
        })
      )
    ).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (sources.length === 0) {
      throw new AppError(errorCodes.INVALID_INPUT, "No ready markdown sources were available for this summary run.", 400);
    }

    const targetLengthMinutes = normalizeLengthMinutes(claimResult.targetLengthMinutes);
    const summary = await summaryProvider.summarize({
      kind: "summary_studio",
      cadence: "WEEKLY",
      timezone: userSettings?.timezone || "UTC",
      periodKey: summaryPeriodKey(claimResult.windowStart, claimResult.windowEnd, claimResult.id),
      windowStart: claimResult.windowStart,
      windowEnd: claimResult.windowEnd,
      targetLengthMinutes,
      targetWords: digestTargetWords(targetLengthMinutes),
      requestedTitle: claimResult.requestedTitle,
      sources
    });

    const summaryDir = normalizeStorageKey(join("summaries", claimResult.userId, claimResult.id));
    const summaryStorageKey = normalizeStorageKey(join(summaryDir, "summary.md"));
    const storedSummary = await storage.putObject(summaryStorageKey, Buffer.from(summary.markdown, "utf8"), {
      contentType: "text/markdown; charset=utf-8"
    });

    const fallbackUsed =
      targetLengthMinutes !== 30 &&
      Boolean(summary.deployment) &&
      summary.deployment === workerEnv.azureOpenAiSummaryMiniDeployment;

    let podcastStatus: string | null = claimResult.podcastEnabled ? "FAILED" : null;
    let podcastError: string | null = null;

    if (claimResult.podcastEnabled) {
      try {
        const narration = summaryMarkdownToNarrationText(summary.markdown);
        const chunks = chunkText(narration, workerEnv.ttsChunkMaxChars);
        if (chunks.length === 0) {
          throw new AppError(errorCodes.EXTRACTION_EMPTY, "Summary markdown is empty.", 400);
        }

        const ttsSelection = normalizeTtsSelection({
          providerId: claimResult.user.ttsProvider,
          voice: claimResult.user.ttsVoice
        });
        const audio = await synthesizeEpisodeAudio(
          claimResult.id,
          chunks,
          ttsSelection,
          undefined,
          normalizeStorageKey(join(summaryDir, "episode.mp3"))
        );
        const guid = `summary-${claimResult.id}`;
        const description = buildEpisodeDescription(narration);
        const publishedAt = new Date();
        const expiresAt = episodeAudioExpiryDate(publishedAt, workerEnv.audioRetentionDays);

        if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
          await workerPrimaryStore.upsertSummaryEpisode({
            id: `summary-episode-${claimResult.id}`,
            summaryRunId: claimResult.id,
            userId: claimResult.userId,
            guid,
            title: summary.title,
            description,
            audioPath: audio.relativePath,
            audioBytes: audio.bytes,
            mimeType: audio.mimeType,
            publishedAt,
            expiresAt
          });
        } else {
          await prisma.summaryEpisode.upsert({
            where: { summaryRunId: claimResult.id },
            update: {
              userId: claimResult.userId,
              guid,
              title: summary.title,
              description,
              audioPath: audio.relativePath,
              audioBytes: audio.bytes,
              mimeType: audio.mimeType,
              publishedAt,
              expiresAt
            },
            create: {
              summaryRunId: claimResult.id,
              userId: claimResult.userId,
              guid,
              title: summary.title,
              description,
              audioPath: audio.relativePath,
              audioBytes: audio.bytes,
              mimeType: audio.mimeType,
              publishedAt,
              expiresAt
            }
          });
        }

        podcastStatus = "SUCCEEDED";
      } catch (error) {
        podcastStatus = "FAILED";
        podcastError = toSafeErrorMessage(
          toSummaryPodcastUserMessage(error instanceof AppError ? error.userMessage : error instanceof Error ? error.message : null) ||
            "The summary is ready, but we couldn't publish the audio version. Please try again."
        );
      }
    }

    if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
      await workerPrimaryStore.updateSummaryRun(claimResult.id, {
        title: summary.title,
        status: "SUCCEEDED",
        selectedItemCount: sources.length,
        podcastStatus,
        podcastError,
        summaryStorageKey: storedSummary.key,
        summaryBytes: storedSummary.bytes,
        summaryProvider: summary.provider,
        summaryModel: summary.model,
        summaryDeployment: summary.deployment ?? null,
        summaryInputTokens: summary.inputTokens ?? null,
        summaryOutputTokens: summary.outputTokens ?? null,
        fallbackUsed,
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null,
        lockedAt: null
      });
    } else {
      await prisma.summaryRun.update({
        where: { id: claimResult.id },
        data: {
          title: summary.title,
          status: "SUCCEEDED",
          selectedItemCount: sources.length,
          podcastStatus,
          podcastError,
          summaryStorageKey: storedSummary.key,
          summaryBytes: storedSummary.bytes,
          summaryProvider: summary.provider,
          summaryModel: summary.model,
          summaryDeployment: summary.deployment ?? null,
          summaryInputTokens: summary.inputTokens ?? null,
          summaryOutputTokens: summary.outputTokens ?? null,
          fallbackUsed,
          completedAt: new Date(),
          errorCode: null,
          errorMessage: null
        }
      });
    }

    await workerLogger.info("Summary run completed", {
      summaryRunId: claimResult.id,
      status: "SUCCEEDED",
      selectedItemCount: sources.length,
      podcastStatus,
      summaryProvider: summary.provider,
      summaryModel: summary.model,
      summaryDeployment: summary.deployment,
      fallbackUsed
    });
    return true;
  } catch (error) {
    const mappedError = mapSummaryError(error);
    const retryRecommended = claimResult.attempt < workerEnv.digestRunMaxRetryAttempts;
    const safeErrorMessage = toSafeErrorMessage(toSummaryRunUserMessage(mappedError.userMessage, mappedError.code));

    try {
      if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
        await workerPrimaryStore.updateSummaryRun(claimResult.id, {
          status: "FAILED",
          errorCode: mappedError.code,
          errorMessage: safeErrorMessage,
          nextRetryAt: retryRecommended ? buildRetryAt(Math.max(30_000, workerEnv.retryPollMs)) : null,
          lockedAt: null
        });
      } else {
        await prisma.summaryRun.update({
          where: { id: claimResult.id },
          data: {
            status: "FAILED",
            errorCode: mappedError.code,
            errorMessage: safeErrorMessage,
            nextRetryAt: retryRecommended ? buildRetryAt(Math.max(30_000, workerEnv.retryPollMs)) : null
          }
        });
      }
    } catch (stateError) {
      if (!isPrismaMissingEntityError(stateError)) {
        throw stateError;
      }
    }

    await workerLogger.errorWithCode({
      msg: "Summary run failed",
      error_code: mappedError.code,
      attrs: {
        summaryRunId: claimResult.id,
        retryRecommended,
        error: toSafeErrorMessage(error)
      }
    });
    return false;
  }
}

export async function processNextQueuedSummaryRun(): Promise<boolean> {
  const reclaimed = await reclaimStaleProcessingSummaryRuns();
  if (reclaimed > 0) {
    await workerLogger.warn("Reclaimed stale processing summary runs", { reclaimed });
  }

  if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
    const next = (await workerPrimaryStore.listNextEligibleSummaryRuns(new Date(), workerEnv.digestRunMaxRetryAttempts))[0];
    if (!next) {
      return false;
    }
    return processSummaryRun(next.id);
  }

  const nextQueued = await prisma.summaryRun.findFirst({
    where: {
      status: "QUEUED"
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  if (nextQueued) {
    return processSummaryRun(nextQueued.id);
  }

  const nextRetryable = await prisma.summaryRun.findFirst({
    where: {
      status: "FAILED",
      nextRetryAt: { lte: new Date() },
      attempt: { lt: workerEnv.digestRunMaxRetryAttempts }
    },
    orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }]
  });
  if (!nextRetryable) {
    return false;
  }
  return processSummaryRun(nextRetryable.id);
}
