import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import {
  AppError,
  buildEpisodeDescription,
  chunkText,
  errorCodes,
  extractHtmlFromUrl,
  extractHtmlSnapshot,
  extractTextFromPdf,
  normalizeTtsSelection,
  resolveEpisodeTitle,
  sanitizeLogPayload,
  withLogContext,
  sha256,
  type TtsProviderId,
  validateFetchableUrl
} from "@articlepod/core";
import { workerEnv } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { makeTtsProvider } from "../lib/providers.js";
import { getArtifactStorage, isLikelyLegacyAbsolutePath, normalizeStorageKey } from "../lib/storage.js";
import { workerLogger } from "../lib/logger.js";
import { recordWorkerAnalyticsEventBestEffort } from "../lib/analytics.js";

type WorkerStage = "extract" | "tts" | "persist" | "job";
type ExtractionLogEntry = {
  at: string;
  stage: string;
  message: string;
  details?: Record<string, unknown>;
};
type SourceArtifact = {
  kind: "RAW_HTML" | "RAW_PDF";
  storageKey: string;
  contentType: string;
  bytes: Buffer;
  expiresAt: Date | null;
};
type ExtractionResult = {
  title: string;
  text: string;
  markdown: string;
  sourceLabel: string;
  sourceArtifact: SourceArtifact | null;
};

const DEMO_TRACE_LIMIT = 10;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const PUBLISHED_AUDIO_FORMAT = "mp3" as const;

function now() {
  return new Date();
}

function generateTraceId(): string {
  return randomBytes(16).toString("hex");
}

function generateSpanId(): string {
  return randomBytes(8).toString("hex");
}

function logNow() {
  return new Date().toISOString();
}

function appendExtractionLog(
  entries: ExtractionLogEntry[],
  stage: string,
  message: string,
  details?: Record<string, unknown>
) {
  entries.push({
    at: logNow(),
    stage,
    message,
    details
  });
}

function retentionExpiryDate(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function markdownToNarrationText(markdown: string, fallbackText: string): string {
  const stripped = markdown
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
    .trim();

  if (stripped.length < 120) {
    return fallbackText.trim();
  }
  return stripped;
}

async function maybeStoreDemoExtractionTrace(input: {
  isDemoUser: boolean;
  userId: string;
  itemId: string;
  sourceLabel: string;
  extractedText: string;
  extractedMarkdown?: string;
  logs: ExtractionLogEntry[];
}) {
  if (!input.isDemoUser) {
    return;
  }

  await prisma.demoExtractionTrace.upsert({
    where: { itemId: input.itemId },
    update: {
      sourceLabel: input.sourceLabel,
      extractedText: input.extractedText,
      extractedMarkdown: input.extractedMarkdown,
      extractionLogJson: input.logs as Prisma.InputJsonValue
    },
    create: {
      userId: input.userId,
      itemId: input.itemId,
      sourceLabel: input.sourceLabel,
      extractedText: input.extractedText,
      extractedMarkdown: input.extractedMarkdown,
      extractionLogJson: input.logs as Prisma.InputJsonValue
    }
  });

  const stale = await prisma.demoExtractionTrace.findMany({
    where: { userId: input.userId },
    orderBy: { updatedAt: "desc" },
    skip: DEMO_TRACE_LIMIT,
    select: { id: true }
  });

  if (stale.length === 0) {
    return;
  }

  await prisma.demoExtractionTrace.deleteMany({
    where: {
      id: {
        in: stale.map((trace) => trace.id)
      }
    }
  });
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
  try {
    await prisma.jobEvent.create({
      data: {
        jobId: payload.jobId,
        itemId: payload.itemId,
        stage: payload.stage,
        eventType: payload.eventType,
        payloadJson: payload
      }
    });
  } catch (error) {
    if (isPrismaMissingEntityError(error)) {
      await workerLogger.warn("Skipping job event persistence; job or item no longer exists", {
        jobId: payload.jobId,
        itemId: payload.itemId,
        stage: payload.stage,
        eventType: payload.eventType
      });
      return;
    }
    throw error;
  }
}

export async function synthesizeEpisodeAudio(
  itemId: string,
  chunks: { text: string }[],
  selection: { providerId: TtsProviderId; voice: string },
  onProgress?: (current: number, total: number) => Promise<void> | void,
  outputKey?: string,
  outputFormat: "mp3" | "m4a" = PUBLISHED_AUDIO_FORMAT
): Promise<{ relativePath: string; bytes: number; mimeType: string }> {
  const provider = makeTtsProvider({ providerId: selection.providerId });
  const extension = outputFormat === "mp3" ? "mp3" : "m4a";
  const mimeType = outputFormat === "mp3" ? "audio/mpeg" : "audio/mp4";
  const relativePath = normalizeStorageKey(outputKey || join("items", itemId, `episode.${extension}`));
  const tempDir = await mkdtemp(join(tmpdir(), "articlepod-worker-"));
  const tempOutputPath = join(tempDir, `episode.${extension}`);

  try {
    if (chunks.length === 1) {
      await provider.synthesizeToFile({
        text: chunks[0]?.text ?? "",
        voice: selection.voice,
        format: outputFormat,
        outPath: tempOutputPath
      });
      if (onProgress) {
        await onProgress(1, 1);
      }
    } else {
      const segmentPaths: string[] = [];
      for (let index = 0; index < chunks.length; index += 1) {
        const segmentPath = join(tempDir, `segment-${index}.${extension}`);
        const segmentText = chunks[index]?.text ?? "";
        await provider.synthesizeToFile({
          text: segmentText,
          voice: selection.voice,
          format: outputFormat,
          outPath: segmentPath
        });
        if (onProgress) {
          await onProgress(index + 1, chunks.length);
        }
        segmentPaths.push(segmentPath);
      }
      await concatenateAudioSegments(segmentPaths, tempOutputPath, outputFormat);
    }

    const bytes = await readFile(tempOutputPath);
    const stored = await getArtifactStorage().putObject(relativePath, bytes, {
      contentType: mimeType
    });

    return {
      relativePath,
      bytes: stored.bytes,
      mimeType: stored.contentType || mimeType
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function runBinary(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} exited with code ${code}`));
      }
    });
  });
}

async function concatenateAudioSegments(
  segmentPaths: string[],
  outPath: string,
  format: "mp3" | "m4a"
): Promise<void> {
  if (segmentPaths.length === 0) {
    throw new AppError(errorCodes.TTS_FAILED, "Audio generation produced no segments.", 500);
  }
  if (segmentPaths.length === 1) {
    const single = await readFile(segmentPaths[0]);
    await writeFile(outPath, single);
    return;
  }

  const concatManifestPath = join(tmpdir(), `articlepod-concat-${randomBytes(6).toString("hex")}.txt`);
  const escapePath = (value: string) => value.replace(/'/g, "'\\''");
  const manifest = segmentPaths.map((path) => `file '${escapePath(path)}'`).join("\n");
  await writeFile(concatManifestPath, `${manifest}\n`, "utf8");

  try {
    try {
      await runBinary("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatManifestPath, "-c", "copy", outPath]);
      return;
    } catch {
      if (format === "m4a") {
        await runBinary("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatManifestPath, "-c:a", "aac", outPath]);
      } else {
        await runBinary("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatManifestPath, "-codec:a", "libmp3lame", outPath]);
      }
    }
  } catch {
    throw new AppError(
      errorCodes.TTS_FAILED,
      "Could not merge synthesized audio segments. Ensure ffmpeg is installed and available on PATH.",
      500
    );
  } finally {
    await rm(concatManifestPath, { force: true });
  }
}

function buildRetryAt(delayMs: number): Date {
  const jitter = Math.floor(Math.random() * 5_000);
  return new Date(Date.now() + delayMs + jitter);
}

async function extractItemText(item: {
  id: string;
  sourceType: string;
  sourceUrl: string | null;
  sourceFilePath: string | null;
  sourceHtml: string | null;
  logs: ExtractionLogEntry[];
}): Promise<ExtractionResult> {
  if (item.sourceType === "URL") {
    if (!item.sourceUrl) {
      throw new AppError(errorCodes.INVALID_INPUT, "Missing source URL", 400);
    }

    appendExtractionLog(item.logs, "extract:url", "Validating URL source", {
      sourceUrl: item.sourceUrl
    });
    const { resolvedIp } = await validateFetchableUrl(item.sourceUrl);
    appendExtractionLog(item.logs, "extract:url", "URL validation passed");

    appendExtractionLog(item.logs, "extract:url", "Fetching and parsing HTML");
    const extracted = await extractHtmlFromUrl(item.sourceUrl, resolvedIp);
    const extractedTitle = extracted.title ?? "";
    appendExtractionLog(item.logs, "extract:url", "HTML extraction complete", {
      extractedTitleLength: extractedTitle.length,
      extractedTextLength: extracted.text.length
    });

    return {
      title: extractedTitle,
      text: extracted.text,
      markdown: extracted.markdown,
      sourceLabel: item.sourceUrl,
      sourceArtifact: {
        kind: "RAW_HTML",
        storageKey: normalizeStorageKey(join("items", item.id, "artifacts", "source.html")),
        contentType: "text/html; charset=utf-8",
        bytes: Buffer.from(extracted.rawHtml, "utf8"),
        expiresAt: retentionExpiryDate(workerEnv.rawArtifactRetentionDays)
      }
    };
  }

  if (item.sourceType === "HTML_SNAPSHOT") {
    let snapshotHtml = item.sourceHtml?.trim() ?? "";
    if (!snapshotHtml && item.sourceFilePath) {
      if (isLikelyLegacyAbsolutePath(item.sourceFilePath)) {
        snapshotHtml = (await readFile(item.sourceFilePath, "utf8")).trim();
      } else {
        const storageKey = normalizeStorageKey(item.sourceFilePath);
        snapshotHtml = (await getArtifactStorage().getObject(storageKey)).toString("utf8").trim();
      }
    }

    if (!snapshotHtml) {
      throw new AppError(errorCodes.INVALID_INPUT, "Missing captured HTML snapshot", 400);
    }

    appendExtractionLog(item.logs, "extract:snapshot", "Parsing captured HTML snapshot", {
      sourceUrl: item.sourceUrl || "about:blank",
      htmlBytes: Buffer.byteLength(snapshotHtml, "utf8")
    });
    const extracted = extractHtmlSnapshot({
      html: snapshotHtml,
      url: item.sourceUrl || undefined
    });
    const extractedTitle = extracted.title ?? "";
    appendExtractionLog(item.logs, "extract:snapshot", "Snapshot extraction complete", {
      extractedTitleLength: extractedTitle.length,
      extractedTextLength: extracted.text.length
    });

    return {
      title: extractedTitle,
      text: extracted.text,
      markdown: extracted.markdown,
      sourceLabel: item.sourceUrl || "Captured browser page",
      sourceArtifact: {
        kind: "RAW_HTML",
        storageKey: normalizeStorageKey(join("items", item.id, "artifacts", "source.html")),
        contentType: "text/html; charset=utf-8",
        bytes: Buffer.from(extracted.rawHtml, "utf8"),
        expiresAt: retentionExpiryDate(workerEnv.rawArtifactRetentionDays)
      }
    };
  }

  if (!item.sourceFilePath) {
    if (item.sourceType !== "PDF") {
      throw new AppError(errorCodes.INVALID_INPUT, "Unsupported item source type", 400);
    }
    throw new AppError(errorCodes.INVALID_INPUT, "Missing source PDF path", 400);
  }

  if (item.sourceType !== "PDF") {
    throw new AppError(errorCodes.INVALID_INPUT, "Unsupported item source type", 400);
  }

  let pdfData: Buffer;
  if (isLikelyLegacyAbsolutePath(item.sourceFilePath)) {
    appendExtractionLog(item.logs, "extract:pdf", "Reading uploaded PDF from legacy local path", {
      sourceFilePath: item.sourceFilePath
    });
    pdfData = await readFile(item.sourceFilePath);
  } else {
    const storageKey = normalizeStorageKey(item.sourceFilePath);
    appendExtractionLog(item.logs, "extract:pdf", "Reading uploaded PDF from artifact storage", {
      storageKey,
      backend: workerEnv.storageBackend
    });
    pdfData = await getArtifactStorage().getObject(storageKey);
  }

  appendExtractionLog(item.logs, "extract:pdf", "PDF bytes loaded", {
    bytes: pdfData.byteLength
  });

  appendExtractionLog(item.logs, "extract:pdf", "Extracting text from PDF");
  const extracted = await extractTextFromPdf(new Uint8Array(pdfData));
  const extractedTitle = extracted.title ?? "";
  appendExtractionLog(item.logs, "extract:pdf", "PDF extraction complete", {
    extractedTitleLength: extractedTitle.length,
    extractedTextLength: extracted.text.length
  });

  return {
    title: extractedTitle,
    text: extracted.text,
    markdown: extracted.markdown,
    sourceLabel: "Uploaded PDF",
    sourceArtifact: {
      kind: "RAW_PDF",
      storageKey: normalizeStorageKey(join("items", item.id, "artifacts", "source.pdf")),
      contentType: "application/pdf",
      bytes: pdfData,
      expiresAt: retentionExpiryDate(workerEnv.rawArtifactRetentionDays)
    }
  };
}

export function shouldRecommendRetry(error: Pick<AppError, "code" | "userMessage">): boolean {
  const message = error.userMessage.toLowerCase();
  if (error.code === errorCodes.TTS_FAILED && message.includes("ffmpeg")) {
    return false;
  }

  switch (error.code) {
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
  return isPrismaErrorCode(error, "P2003") || isPrismaErrorCode(error, "P2025");
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

  const normalized = message.trim() || "Processing failed unexpectedly. Please retry.";
  if (normalized.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_ERROR_MESSAGE_LENGTH - 3).trimEnd()}...`;
}

function mapUnexpectedWorkerError(error: unknown, stage: WorkerStage): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const diagnostic = toSafeErrorMessage(error).toLowerCase();

  if (stage === "extract") {
    return new AppError(
      errorCodes.EXTRACTION_FAILED,
      "Could not read this source. Retry once, or try another URL/PDF if it keeps failing.",
      502
    );
  }

  if (stage === "tts") {
    if (diagnostic.includes("at most") && diagnostic.includes("body.text")) {
      return new AppError(
        errorCodes.INVALID_INPUT,
        "This source is too long to narrate in one episode. Try splitting it into smaller parts.",
        400
      );
    }
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

async function reclaimStaleProcessingJobs(): Promise<number> {
  const staleBefore = new Date(Date.now() - workerEnv.staleProcessingMs);
  const staleJobs = await prisma.job.findMany({
    where: {
      status: "PROCESSING",
      lockedAt: {
        lt: staleBefore
      }
    },
    select: {
      id: true,
      itemId: true
    }
  });

  if (staleJobs.length === 0) {
    return 0;
  }

  let reclaimed = 0;
  for (const job of staleJobs) {
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Re-check status inside transaction to prevent double-reclaim race
        await tx.job.update({
          where: { id: job.id, status: "PROCESSING", lockedAt: { lt: staleBefore } },
          data: {
            status: "QUEUED",
            lockedAt: null,
            nextRetryAt: new Date()
          }
        });

        await tx.item.updateMany({
          where: {
            id: job.itemId,
            status: "PROCESSING"
          },
          data: {
            status: "QUEUED"
          }
        });
      });
      reclaimed++;
    } catch {
      // Job was already claimed by another worker instance — skip it
    }
  }

  return reclaimed;
}

export async function processJob(jobId: string): Promise<boolean> {
  const nowTs = now();
  const claimResult = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const next = await tx.job.findFirst({
      where: {
        id: jobId,
        OR: [
          { status: "QUEUED" },
          {
            status: "FAILED",
            nextRetryAt: { lte: nowTs },
            attempt: { lt: workerEnv.maxRetryAttempts }
          }
        ]
      },
      include: {
        item: {
          include: {
            user: {
              select: {
                email: true,
                ttsProvider: true,
                ttsVoice: true
              }
            }
          }
        }
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
        item: {
          include: {
            user: {
              select: {
                email: true,
                ttsProvider: true,
                ttsVoice: true
              }
            }
          }
        }
      }
    });

    await tx.item.update({
      where: { id: next.itemId },
      data: { status: "PROCESSING", errorCode: null, errorMessage: "Processing in progress..." }
    });

    return claimed;
  });

  if (!claimResult) {
    return false;
  }

  const item = claimResult.item;
  const lockedAtMs = claimResult.lockedAt?.getTime() ?? claimResult.updatedAt.getTime();
  const queueWaitMs = Math.max(0, lockedAtMs - claimResult.createdAt.getTime());
  const traceId = generateTraceId();
  const spanId = generateSpanId();
  const extractionLogs: ExtractionLogEntry[] = [];
  const isDemoUser = (item.user?.email ?? "").toLowerCase() === workerEnv.demoEmail.toLowerCase();
  let sourceLabelForDiagnostics =
    item.sourceType === "URL"
      ? item.sourceUrl || "URL source"
      : item.sourceType === "HTML_SNAPSHOT"
        ? item.sourceUrl || "Captured browser page"
      : "Uploaded PDF";
  let extractedTextForDiagnostics = "";
  let extractedMarkdownForDiagnostics = "";

  await withLogContext(
    {
      trace_id: traceId,
      span_id: spanId,
      job_id: claimResult.id,
      item_id: item.id
    },
    async () => {
      await workerLogger.info("Job claimed", {
        sourceType: item.sourceType,
        attempt: claimResult.attempt
      });
    }
  );

  await appendJobEvent({
    jobId: claimResult.id,
    itemId: item.id,
    stage: "job",
    eventType: "start",
    message: "Processing started"
  });
  appendExtractionLog(extractionLogs, "job", "Job processing started", {
    itemId: item.id,
    sourceType: item.sourceType
  });

  let stage: WorkerStage = "extract";
  try {
    return await withLogContext(
      {
        trace_id: traceId,
        span_id: spanId,
        job_id: claimResult.id,
        item_id: item.id
      },
      async () => {
    const extraction = await extractItemText({
      id: item.id,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      sourceFilePath: item.sourceFilePath,
      sourceHtml: item.sourceHtml,
      logs: extractionLogs
    });
    sourceLabelForDiagnostics = extraction.sourceLabel;
    extractedTextForDiagnostics = extraction.text;
    extractedMarkdownForDiagnostics = extraction.markdown;

    if (extraction.sourceArtifact) {
      const storedRaw = await getArtifactStorage().putObject(extraction.sourceArtifact.storageKey, extraction.sourceArtifact.bytes, {
        contentType: extraction.sourceArtifact.contentType
      });
      await prisma.itemArtifact.upsert({
        where: {
          itemId_kind: {
            itemId: item.id,
            kind: extraction.sourceArtifact.kind
          }
        },
        update: {
          storageKey: storedRaw.key,
          contentType: extraction.sourceArtifact.contentType,
          byteLength: storedRaw.bytes,
          expiresAt: extraction.sourceArtifact.expiresAt
        },
        create: {
          itemId: item.id,
          kind: extraction.sourceArtifact.kind,
          storageKey: storedRaw.key,
          contentType: extraction.sourceArtifact.contentType,
          byteLength: storedRaw.bytes,
          expiresAt: extraction.sourceArtifact.expiresAt
        }
      });
      appendExtractionLog(extractionLogs, "extract", "Source artifact persisted", {
        kind: extraction.sourceArtifact.kind,
        storageKey: storedRaw.key,
        bytes: storedRaw.bytes
      });
    }

    const markdownStorageKey = normalizeStorageKey(join("items", item.id, "artifacts", "source.md"));
    const markdownStored = await getArtifactStorage().putObject(markdownStorageKey, Buffer.from(extraction.markdown, "utf8"), {
      contentType: "text/markdown; charset=utf-8"
    });
    await prisma.itemArtifact.upsert({
      where: {
        itemId_kind: {
          itemId: item.id,
          kind: "MARKDOWN"
        }
      },
      update: {
        storageKey: markdownStored.key,
        contentType: "text/markdown; charset=utf-8",
        byteLength: markdownStored.bytes,
        expiresAt: null
      },
      create: {
        itemId: item.id,
        kind: "MARKDOWN",
        storageKey: markdownStored.key,
        contentType: "text/markdown; charset=utf-8",
        byteLength: markdownStored.bytes,
        expiresAt: null
      }
    });
    appendExtractionLog(extractionLogs, "extract", "Markdown artifact persisted", {
      storageKey: markdownStored.key,
      bytes: markdownStored.bytes
    });

    const userProvidedTitle = item.title?.trim() || "";
    const narrationText = markdownToNarrationText(extraction.markdown, extraction.text);
    const resolvedTitle = userProvidedTitle || resolveEpisodeTitle(extraction.title, narrationText);
    appendExtractionLog(extractionLogs, "extract", "Title resolved", {
      usedUserProvidedTitle: Boolean(userProvidedTitle),
      resolvedTitle
    });

    const chunks = chunkText(narrationText, workerEnv.ttsChunkMaxChars);
    if (chunks.length === 0) {
      throw new AppError(errorCodes.EXTRACTION_EMPTY, "No narratable content found.", 400);
    }
    appendExtractionLog(extractionLogs, "extract", "Text chunking complete", {
      chunkCount: chunks.length,
      chunkMaxChars: workerEnv.ttsChunkMaxChars
    });

    const ttsSelection = normalizeTtsSelection({
      providerId: item.user?.ttsProvider,
      voice: item.user?.ttsVoice
    });
    appendExtractionLog(extractionLogs, "tts", "TTS selection resolved", {
      providerId: ttsSelection.providerId,
      voice: ttsSelection.voice
    });

    const cacheKey = sha256([item.userId, ttsSelection.providerId, ttsSelection.voice, ...chunks.map((chunk) => chunk.hash)].join("|"));
    const cacheHit = await prisma.chunkCache.findUnique({ where: { hash: cacheKey } });

    let audio: { relativePath: string; bytes: number; mimeType: string };
    if (cacheHit) {
      await workerLogger.info("TTS cache hit", {
        cacheKey,
        bytes: cacheHit.audioBytes
      });
      appendExtractionLog(extractionLogs, "tts", "Cache hit for synthesized audio", {
        cacheKey,
        filePath: cacheHit.filePath,
        bytes: cacheHit.audioBytes
      });
      audio = {
        relativePath: cacheHit.filePath,
        bytes: cacheHit.audioBytes,
        mimeType: cacheHit.mimeType
      };
    } else {
      stage = "tts";
      await workerLogger.info("TTS cache miss; synthesizing", {
        cacheKey,
        providerId: ttsSelection.providerId,
        voice: ttsSelection.voice,
        chunkCount: chunks.length
      });
      appendExtractionLog(extractionLogs, "tts", "Cache miss, synthesizing narration", {
        cacheKey,
        chunkCount: chunks.length
      });
      let lastProgressWriteAt = 0;
      audio = await synthesizeEpisodeAudio(item.id, chunks, ttsSelection, async (current, total) => {
        const nowMs = Date.now();
        const shouldWrite = current === total || current === 1 || nowMs - lastProgressWriteAt >= 4000;
        if (!shouldWrite) {
          return;
        }
        lastProgressWriteAt = nowMs;
        const progressMessage =
          total <= 1 ? "Processing audio..." : `Processing audio chunk ${current}/${total}...`;
        await prisma.item.updateMany({
          where: {
            id: item.id,
            status: "PROCESSING"
          },
          data: {
            errorMessage: progressMessage
          }
        });
      });
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
      appendExtractionLog(extractionLogs, "tts", "Narration synthesis complete", {
        outputPath: audio.relativePath,
        bytes: audio.bytes,
        mimeType: audio.mimeType
      });
    }

    const guid = `episode-${item.id}`;
    const description = buildEpisodeDescription(narrationText);

    stage = "persist";
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.episode.upsert({
        where: { itemId: item.id },
        update: {
          guid,
          title: resolvedTitle,
          description,
          audioPath: audio.relativePath,
          audioBytes: audio.bytes,
          mimeType: audio.mimeType,
          publishedAt: now()
        },
        create: {
          itemId: item.id,
          guid,
          title: resolvedTitle,
          description,
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
          sourceHtml: item.sourceType === "HTML_SNAPSHOT" ? null : undefined,
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
    appendExtractionLog(extractionLogs, "persist", "Episode and item persisted", {
      guid,
      audioPath: audio.relativePath
    });

    await appendJobEvent({
      jobId: claimResult.id,
      itemId: item.id,
      stage: "job",
      eventType: "success",
      message: "Processing completed"
    });
    appendExtractionLog(extractionLogs, "job", "Job completed successfully");
    await workerLogger.info("Job completed", {
      status: "SUCCEEDED",
      sourceType: item.sourceType
    });

    try {
      await maybeStoreDemoExtractionTrace({
        isDemoUser,
        userId: item.userId,
        itemId: item.id,
        sourceLabel: sourceLabelForDiagnostics,
        extractedText: extractedTextForDiagnostics,
        extractedMarkdown: extractedMarkdownForDiagnostics,
        logs: extractionLogs
      });
    } catch {
      // Demo diagnostics are best-effort and should not fail the job.
    }

    const completionAt = new Date();
    const processingDurationMs = Math.max(0, completionAt.getTime() - lockedAtMs);
    const sourceType =
      item.sourceType === "URL" || item.sourceType === "PDF" || item.sourceType === "HTML_SNAPSHOT" ? item.sourceType : "URL";
    await recordWorkerAnalyticsEventBestEffort({
      eventType: "ITEM_READY",
      userId: item.userId,
      itemId: item.id,
      sourceType,
      dedupeKey: `item_ready:${item.id}`,
      occurredAt: completionAt,
      metadata: {
        queue_wait_ms: queueWaitMs,
        processing_duration_ms: processingDurationMs,
        job_id: claimResult.id
      }
    });

    return true;
      }
    );
  } catch (error) {
    const err = mapUnexpectedWorkerError(error, stage);
    const diagnostic = formatDiagnostic(error);
    const retryRecommended =
      shouldRecommendRetry(err) && claimResult.attempt < workerEnv.maxRetryAttempts;
    const safeErrorMessage = toSafeErrorMessage(err.userMessage);

    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.item.update({
          where: { id: item.id },
          data: {
            status: "FAILED",
            errorCode: err.code,
            errorMessage: safeErrorMessage
          }
        });

        await tx.job.update({
          where: { id: claimResult.id },
          data: {
            status: "FAILED",
            errorCode: err.code,
            errorMessage: safeErrorMessage,
            nextRetryAt: retryRecommended ? buildRetryAt(Math.max(30_000, workerEnv.retryPollMs)) : null
          }
        });
      });
    } catch (stateError) {
      const fallbackMessage = toSafeErrorMessage(stateError);
      await workerLogger.errorWithCode({
        msg: "Failed to persist job failure state",
        error_code: errorCodes.INTERNAL_ERROR,
        attrs: {
          originalErrorCode: err.code,
          originalErrorMessage: safeErrorMessage,
          fallbackMessage
        }
      });

      await prisma.item.updateMany({
        where: { id: item.id },
        data: {
          status: "FAILED",
          errorCode: err.code,
          errorMessage: "Processing failed. Please retry."
        }
      });
      await prisma.job.updateMany({
        where: { id: claimResult.id },
        data: {
          status: "FAILED",
          errorCode: err.code,
          errorMessage: "Processing failed. Please retry.",
          nextRetryAt: retryRecommended ? buildRetryAt(Math.max(30_000, workerEnv.retryPollMs)) : null
        }
      });
    }

    await appendJobEvent({
      jobId: claimResult.id,
      itemId: item.id,
      stage,
      eventType: "error",
      message: safeErrorMessage,
      errorCode: err.code,
      diagnostic,
      retryRecommended
    });
    appendExtractionLog(extractionLogs, stage, "Job failed", {
      errorCode: err.code,
      errorMessage: safeErrorMessage,
      retryRecommended
    });
    await withLogContext(
      {
        trace_id: traceId,
        span_id: spanId,
        job_id: claimResult.id,
        item_id: item.id
      },
      async () => {
    await workerLogger.errorWithCode({
      msg: "Job failed",
      error_code: err.code,
      attrs: {
        stage,
        diagnostic,
        retryRecommended,
        userMessage: safeErrorMessage
      }
    });
      }
    );

    try {
      await maybeStoreDemoExtractionTrace({
        isDemoUser,
        userId: item.userId,
        itemId: item.id,
        sourceLabel: sourceLabelForDiagnostics,
        extractedText: extractedTextForDiagnostics,
        extractedMarkdown: extractedMarkdownForDiagnostics,
        logs: extractionLogs
      });
    } catch {
      // Demo diagnostics are best-effort and should not fail the job.
    }

    const completionAt = new Date();
    const processingDurationMs = Math.max(0, completionAt.getTime() - lockedAtMs);
    const sourceType =
      item.sourceType === "URL" || item.sourceType === "PDF" || item.sourceType === "HTML_SNAPSHOT" ? item.sourceType : "URL";
    await recordWorkerAnalyticsEventBestEffort({
      eventType: "ITEM_FAILED",
      userId: item.userId,
      itemId: item.id,
      sourceType,
      dedupeKey: `item_failed:${item.id}`,
      occurredAt: completionAt,
      metadata: {
        queue_wait_ms: queueWaitMs,
        processing_duration_ms: processingDurationMs,
        error_code: err.code,
        retry_recommended: retryRecommended,
        job_id: claimResult.id
      }
    });

    return false;
  }
}

export async function processNextQueuedJob(): Promise<boolean> {
  const reclaimed = await reclaimStaleProcessingJobs();
  if (reclaimed > 0) {
    await workerLogger.warn("Reclaimed stale processing jobs", { reclaimed });
  }

  const nextQueued = await prisma.job.findFirst({
    where: {
      status: "QUEUED"
    },
    orderBy: [{ createdAt: "asc" }]
  });

  if (nextQueued) {
    return processJob(nextQueued.id);
  }

  const nextRetryable = await prisma.job.findFirst({
    where: {
      status: "FAILED",
      nextRetryAt: { lte: now() },
      attempt: { lt: workerEnv.maxRetryAttempts }
    },
    orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }]
  });

  if (!nextRetryable) {
    return false;
  }

  return processJob(nextRetryable.id);
}
