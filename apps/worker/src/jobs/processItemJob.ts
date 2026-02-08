import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Prisma } from "@prisma/client";
import {
  AppError,
  chunkText,
  errorCodes,
  extractHtmlFromUrl,
  extractTextFromPdf,
  resolveEpisodeTitle,
  sanitizeLogPayload,
  sha256,
  validateFetchableUrl
} from "@listenlater/core";
import { workerEnv } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { makeTtsProvider } from "../lib/providers.js";

type WorkerStage = "extract" | "tts" | "persist" | "job";

function now() {
  return new Date();
}

async function appendJobEvent(input: {
  jobId: string;
  itemId: string;
  stage: string;
  eventType: "start" | "success" | "error";
  message: string;
  errorCode?: string;
  diagnostic?: string;
  retryRecommended?: boolean;
}) {
  const payload = sanitizeLogPayload(input);
  await prisma.jobEvent.create({
    data: {
      jobId: payload.jobId,
      itemId: payload.itemId,
      stage: payload.stage,
      eventType: payload.eventType,
      payloadJson: payload
    }
  });
}

async function synthesizeEpisodeAudio(itemId: string, text: string): Promise<{ relativePath: string; bytes: number; mimeType: string }> {
  const provider = makeTtsProvider();
  const itemDir = join(workerEnv.mediaRoot, "items", itemId);
  const outputPath = join(itemDir, "episode.m4a");

  await mkdir(dirname(outputPath), { recursive: true });

  await provider.synthesizeToFile({
    text,
    voice: workerEnv.defaultVoice,
    format: "m4a",
    outPath: outputPath
  });

  const fileInfo = await stat(outputPath);

  return {
    relativePath: join("items", itemId, "episode.m4a"),
    bytes: fileInfo.size,
    mimeType: "audio/mp4"
  };
}

async function extractItemText(item: {
  id: string;
  sourceType: string;
  sourceUrl: string | null;
  sourceFilePath: string | null;
}) {
  if (item.sourceType === "URL") {
    if (!item.sourceUrl) {
      throw new AppError(errorCodes.INVALID_INPUT, "Missing source URL", 400);
    }

    await validateFetchableUrl(item.sourceUrl);
    const extracted = await extractHtmlFromUrl(item.sourceUrl);
    return { title: extracted.title, text: extracted.text };
  }

  if (!item.sourceFilePath) {
    throw new AppError(errorCodes.INVALID_INPUT, "Missing source PDF path", 400);
  }

  if (item.sourceType !== "PDF") {
    throw new AppError(errorCodes.INVALID_INPUT, "Unsupported item source type", 400);
  }

  const pdfData = await readFile(item.sourceFilePath);
  const extracted = await extractTextFromPdf(new Uint8Array(pdfData));

  return {
    title: extracted.title,
    text: extracted.text
  };
}

function shouldRecommendRetry(errorCode: string): boolean {
  switch (errorCode) {
    case errorCodes.EXTRACTION_FAILED:
    case errorCodes.TTS_FAILED:
    case errorCodes.STORAGE_FAILED:
    case errorCodes.RATE_LIMITED:
      return true;
    default:
      return false;
  }
}

function formatDiagnostic(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function mapUnexpectedWorkerError(error: unknown, stage: WorkerStage): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (stage === "extract") {
    return new AppError(
      errorCodes.EXTRACTION_FAILED,
      "Could not read this source. Retry once, or try another URL/PDF if it keeps failing.",
      502
    );
  }

  if (stage === "tts") {
    return new AppError(
      errorCodes.TTS_FAILED,
      "Audio generation failed unexpectedly. Retry once; if it repeats, check TTS setup.",
      500
    );
  }

  if (stage === "persist") {
    return new AppError(
      errorCodes.STORAGE_FAILED,
      "Processing finished but saving the episode failed. Please retry.",
      500
    );
  }

  return new AppError(errorCodes.INTERNAL_ERROR, "Processing failed unexpectedly. Please retry.", 500);
}

export async function processJob(jobId: string): Promise<boolean> {
  const claimResult = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const next = await tx.job.findFirst({
      where: {
        id: jobId,
        status: { in: ["QUEUED", "FAILED"] }
      },
      include: {
        item: true
      }
    });

    if (!next) {
      return null;
    }

    const claimed = await tx.job.update({
      where: { id: next.id },
      data: {
        status: "PROCESSING",
        lockedAt: now(),
        attempt: { increment: 1 }
      },
      include: {
        item: true
      }
    });

    await tx.item.update({
      where: { id: next.itemId },
      data: { status: "PROCESSING", errorCode: null, errorMessage: null }
    });

    return claimed;
  });

  if (!claimResult) {
    return false;
  }

  const item = claimResult.item;

  await appendJobEvent({
    jobId: claimResult.id,
    itemId: item.id,
    stage: "job",
    eventType: "start",
    message: "Processing started"
  });

  let stage: WorkerStage = "extract";
  try {
    const extraction = await extractItemText({
      id: item.id,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      sourceFilePath: item.sourceFilePath
    });
    const userProvidedTitle = item.title?.trim() || "";
    const resolvedTitle = userProvidedTitle || resolveEpisodeTitle(extraction.title, extraction.text);

    const chunks = chunkText(extraction.text);
    if (chunks.length === 0) {
      throw new AppError(errorCodes.EXTRACTION_EMPTY, "No narratable content found.", 400);
    }

    const cacheKey = sha256(chunks.map((chunk) => chunk.hash).join("|"));
    const cacheHit = await prisma.chunkCache.findUnique({ where: { hash: cacheKey } });

    let audio: { relativePath: string; bytes: number; mimeType: string };
    if (cacheHit) {
      audio = {
        relativePath: cacheHit.filePath,
        bytes: cacheHit.audioBytes,
        mimeType: cacheHit.mimeType
      };
    } else {
      stage = "tts";
      audio = await synthesizeEpisodeAudio(item.id, extraction.text);
      await prisma.chunkCache.create({
        data: {
          itemId: item.id,
          chunkIndex: 0,
          hash: cacheKey,
          filePath: audio.relativePath,
          audioBytes: audio.bytes,
          mimeType: audio.mimeType
        }
      });
    }

    const guid = `episode-${item.id}`;

    stage = "persist";
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.episode.upsert({
        where: { itemId: item.id },
        update: {
          guid,
          title: resolvedTitle,
          description: extraction.text.slice(0, 400),
          audioPath: audio.relativePath,
          audioBytes: audio.bytes,
          mimeType: audio.mimeType,
          publishedAt: now()
        },
        create: {
          itemId: item.id,
          guid,
          title: resolvedTitle,
          description: extraction.text.slice(0, 400),
          audioPath: audio.relativePath,
          audioBytes: audio.bytes,
          mimeType: audio.mimeType,
          publishedAt: now()
        }
      });

      await tx.item.update({
        where: { id: item.id },
        data: {
          title: resolvedTitle,
          status: "READY",
          textHash: cacheKey,
          errorCode: null,
          errorMessage: null
        }
      });

      await tx.job.update({
        where: { id: claimResult.id },
        data: {
          status: "SUCCEEDED",
          errorCode: null,
          errorMessage: null
        }
      });
    });

    await appendJobEvent({
      jobId: claimResult.id,
      itemId: item.id,
      stage: "job",
      eventType: "success",
      message: "Processing completed"
    });

    return true;
  } catch (error) {
    const err = mapUnexpectedWorkerError(error, stage);
    const diagnostic = formatDiagnostic(error);
    const retryRecommended = shouldRecommendRetry(err.code);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.item.update({
        where: { id: item.id },
        data: {
          status: "FAILED",
          errorCode: err.code,
          errorMessage: err.userMessage
        }
      });

      await tx.job.update({
        where: { id: claimResult.id },
        data: {
          status: "FAILED",
          errorCode: err.code,
          errorMessage: err.userMessage,
          nextRetryAt: new Date(Date.now() + 30_000)
        }
      });
    });

    await appendJobEvent({
      jobId: claimResult.id,
      itemId: item.id,
      stage,
      eventType: "error",
      message: err.userMessage,
      errorCode: err.code,
      diagnostic,
      retryRecommended
    });

    return false;
  }
}

export async function processNextQueuedJob(): Promise<boolean> {
  const next = await prisma.job.findFirst({
    where: {
      status: "QUEUED"
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  if (!next) {
    return false;
  }

  return processJob(next.id);
}
