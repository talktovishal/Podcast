import { join } from "node:path";
import {
  AppError,
  buildEpisodeDescription,
  buildDigestGuid,
  chunkText,
  digestTargetWords,
  errorCodes,
  normalizeTtsSelection,
  type DigestLengthMinutes
} from "@articlepod/core";
import type { Prisma } from "@prisma/client";
import { workerEnv } from "../lib/env.js";
import { makeDigestEmailSender } from "../lib/digest-email.js";
import { workerLogger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { makeSummaryProvider } from "../lib/summary.js";
import { getArtifactStorage, normalizeStorageKey } from "../lib/storage.js";
import { synthesizeEpisodeAudio } from "./processItemJob.js";
import { syncDigestRunProjectionById } from "../lib/metadata-projection.js";

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

function markdownToNarrationText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+[.)]\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+/g, " ")
    .trim();
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

  const normalized = message.trim() || "Digest processing failed unexpectedly. Please retry.";
  if (normalized.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_ERROR_MESSAGE_LENGTH - 3).trimEnd()}...`;
}

function mapDigestError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError(errorCodes.INTERNAL_ERROR, "Digest processing failed unexpectedly. Please retry.", 500);
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

async function reclaimStaleProcessingDigestRuns(): Promise<number> {
  const staleBefore = new Date(Date.now() - workerEnv.staleProcessingMs);
  const staleRuns = await prisma.digestRun.findMany({
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

  if (staleRuns.length === 0) {
    return 0;
  }

  let reclaimed = 0;
  for (const run of staleRuns) {
    try {
      // Re-check status inside transaction to prevent double-reclaim race
      await prisma.digestRun.update({
        where: { id: run.id, status: "PROCESSING", lockedAt: { lt: staleBefore } },
        data: {
          status: "QUEUED",
          lockedAt: null,
          nextRetryAt: new Date()
        }
      });
      reclaimed++;
      await syncDigestRunProjectionById(run.id);
    } catch {
      // Run was already claimed by another worker instance — skip it
    }
  }

  return reclaimed;
}

export async function processDigestRun(runId: string): Promise<boolean> {
  const nowTs = new Date();
  const claimResult = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const next = await tx.digestRun.findFirst({
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
            email: true,
            ttsProvider: true,
            ttsVoice: true
          }
        }
      }
    });

    if (!next) {
      return null;
    }

    return tx.digestRun.update({
      where: {
        id: next.id
      },
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
            email: true,
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

  await syncDigestRunProjectionById(claimResult.id);

  const summaryProvider = makeSummaryProvider();
  const emailSender = makeDigestEmailSender();
  const storage = getArtifactStorage();

  try {
    const userSettings = await prisma.userDigestSettings.findUnique({
      where: { userId: claimResult.userId },
      select: { timezone: true }
    });

    const sourceItems = await prisma.item.findMany({
      where: {
        userId: claimResult.userId,
        status: "READY",
        sourceType: {
          in: ["URL", "PDF", "HTML_SNAPSHOT"]
        },
        createdAt: {
          gt: claimResult.windowStart,
          lte: claimResult.windowEnd
        }
      },
      include: {
        artifacts: {
          where: { kind: "MARKDOWN" },
          take: 1
        }
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }]
    });

    const sources = (
      await Promise.all(
        sourceItems.map(async (item) => {
          const artifact = item.artifacts[0];
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
      await prisma.digestRun.update({
        where: { id: claimResult.id },
        data: {
          status: "SKIPPED",
          sourceItemCount: 0,
          completedAt: new Date(),
          emailStatus: claimResult.emailEnabled ? "SKIPPED" : null,
          podcastStatus: claimResult.podcastEnabled ? "SKIPPED" : null
        }
      });
      await syncDigestRunProjectionById(claimResult.id);
      return true;
    }

    const targetLengthMinutes = normalizeLengthMinutes(claimResult.targetLengthMinutes);
    const targetWords = digestTargetWords(targetLengthMinutes);
    const summary = await summaryProvider.summarize({
      cadence: claimResult.cadence === "WEEKLY" ? "WEEKLY" : "DAILY",
      timezone: userSettings?.timezone || "UTC",
      periodKey: claimResult.periodKey,
      windowStart: claimResult.windowStart,
      windowEnd: claimResult.windowEnd,
      targetLengthMinutes,
      targetWords,
      sources
    });

    const digestDir = normalizeStorageKey(join("digests", claimResult.userId, claimResult.cadence.toLowerCase(), claimResult.periodKey));
    const summaryStorageKey = normalizeStorageKey(join(digestDir, "summary.md"));
    const summaryStored = await storage.putObject(summaryStorageKey, Buffer.from(summary.markdown, "utf8"), {
      contentType: "text/markdown; charset=utf-8"
    });

    let emailStatus: string | null = claimResult.emailEnabled ? "FAILED" : null;
    let emailSubject: string | null = null;
    let emailStorageKey: string | null = null;
    let emailError: string | null = null;

    if (claimResult.emailEnabled) {
      emailSubject = `${summary.title}`;
      emailStorageKey = normalizeStorageKey(join(digestDir, "email.md"));
      await storage.putObject(emailStorageKey, Buffer.from(summary.markdown, "utf8"), {
        contentType: "text/markdown; charset=utf-8"
      });
      try {
        const sendResult = await emailSender.send({
          userId: claimResult.userId,
          toEmail: claimResult.user.email,
          cadence: claimResult.cadence === "WEEKLY" ? "WEEKLY" : "DAILY",
          periodKey: claimResult.periodKey,
          subject: emailSubject,
          markdownBody: summary.markdown
        });
        emailStatus = sendResult.status;
      } catch (error) {
        emailStatus = "FAILED";
        emailError = toSafeErrorMessage(error);
      }
    }

    let podcastStatus: string | null = claimResult.podcastEnabled ? "FAILED" : null;
    let podcastError: string | null = null;
    if (claimResult.podcastEnabled) {
      try {
        const narration = markdownToNarrationText(summary.plainText || summary.markdown);
        const chunks = chunkText(narration, workerEnv.ttsChunkMaxChars);
        if (chunks.length === 0) {
          throw new AppError(errorCodes.EXTRACTION_EMPTY, "Digest summary is empty.", 400);
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
          normalizeStorageKey(join(digestDir, "episode.mp3"))
        );
        const guid = buildDigestGuid({
          userId: claimResult.userId,
          cadence: claimResult.cadence === "WEEKLY" ? "WEEKLY" : "DAILY",
          periodKey: claimResult.periodKey
        });
        const description = buildEpisodeDescription(summary.plainText || narration);

        await prisma.digestEpisode.upsert({
          where: { digestRunId: claimResult.id },
          update: {
            userId: claimResult.userId,
            guid,
            title: summary.title,
            description,
            audioPath: audio.relativePath,
            audioBytes: audio.bytes,
            mimeType: audio.mimeType,
            publishedAt: new Date()
          },
          create: {
            digestRunId: claimResult.id,
            userId: claimResult.userId,
            guid,
            title: summary.title,
            description,
            audioPath: audio.relativePath,
            audioBytes: audio.bytes,
            mimeType: audio.mimeType,
            publishedAt: new Date()
          }
        });

        podcastStatus = "SUCCEEDED";
      } catch (error) {
        podcastStatus = "FAILED";
        podcastError = toSafeErrorMessage(error);
      }
    }

    await prisma.digestRun.update({
      where: {
        id: claimResult.id
      },
      data: {
        status: "SUCCEEDED",
        sourceItemCount: sources.length,
        summaryStorageKey: summaryStored.key,
        summaryBytes: summaryStored.bytes,
        emailStatus,
        emailSubject,
        emailStorageKey,
        emailError,
        podcastStatus,
        podcastError,
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null
      }
    });
    await syncDigestRunProjectionById(claimResult.id);

    await workerLogger.info("Digest run completed", {
      digestRunId: claimResult.id,
      cadence: claimResult.cadence,
      status: "SUCCEEDED",
      sourceItemCount: sources.length,
      emailStatus,
      podcastStatus
    });
    return true;
  } catch (error) {
    const mappedError = mapDigestError(error);
    const retryRecommended = claimResult.attempt < workerEnv.digestRunMaxRetryAttempts;
    const safeErrorMessage = toSafeErrorMessage(mappedError.userMessage);

    try {
      await prisma.digestRun.update({
        where: { id: claimResult.id },
        data: {
          status: "FAILED",
          errorCode: mappedError.code,
          errorMessage: safeErrorMessage,
          nextRetryAt: retryRecommended ? buildRetryAt(Math.max(30_000, workerEnv.retryPollMs)) : null
        }
      });
      await syncDigestRunProjectionById(claimResult.id);
    } catch (stateError) {
      if (!isPrismaMissingEntityError(stateError)) {
        throw stateError;
      }
    }

    await workerLogger.errorWithCode({
      msg: "Digest run failed",
      error_code: mappedError.code,
      attrs: {
        digestRunId: claimResult.id,
        retryRecommended,
        error: toSafeErrorMessage(error)
      }
    });
    return false;
  }
}

export async function processNextQueuedDigestRun(): Promise<boolean> {
  const reclaimed = await reclaimStaleProcessingDigestRuns();
  if (reclaimed > 0) {
    await workerLogger.warn("Reclaimed stale processing digest runs", { reclaimed });
  }

  const nextQueued = await prisma.digestRun.findFirst({
    where: {
      status: "QUEUED"
    },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }]
  });

  if (nextQueued) {
    return processDigestRun(nextQueued.id);
  }

  const nextRetryable = await prisma.digestRun.findFirst({
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

  return processDigestRun(nextRetryable.id);
}
