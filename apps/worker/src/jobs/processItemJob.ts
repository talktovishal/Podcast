import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { Prisma } from "@prisma/client";
import {
  AppError,
  BLOCKED_SITE_HTML_SNAPSHOT_MESSAGE,
  type HtmlExtractionSelectionDiagnostics,
  type ReservedDispatchQueueMessage,
  buildUserItemMarkdownStorageKey,
  buildUserItemSummaryStorageKey,
  buildEpisodeDescription,
  canonicalizeFetchableUrl,
  cleanExtractedMarkdown,
  chunkText,
  digestTargetWords,
  errorCodes,
  episodeAudioExpiryDate,
  extractHtmlFromUrlWithDiagnostics,
  extractHtmlSnapshot,
  extractTextFromPdf,
  getHtmlFetchDiagnostics,
  hasNarratableText,
  lowSignalExtractionMessage,
  markdownToNarrationText,
  normalizeTtsSelection,
  resolveEpisodeTitle,
  sanitizeLogPayload,
  summarizeHtmlExtractionSelection,
  shouldSuggestHtmlSnapshotForError,
  withLogContext,
  sha256,
  type DigestSummaryResponse,
  type ItemJobKind,
  type TtsProvider,
  type TtsProviderId
} from "@articlepod/core";
import { workerEnv } from "../lib/env.js";
import { createWorkerItemDispatchQueue } from "../lib/item-dispatch-queue.js";
import { workerPrimaryStore, workerUsesAzureTablePrimary } from "../lib/metadata-primary-store.js";
import {
  LONG_SOURCE_SUMMARY_NOTICE,
  assertNarrationChunkLimit,
  automaticSummaryTargetLengthMinutes,
  buildLongSourceSummaryNarration,
  fitLongSourceSummaryNarration,
  shouldSummarizeLongSource
} from "../lib/narrationLimits.js";
import { prisma } from "../lib/prisma.js";
import { makeTtsProvider } from "../lib/providers.js";
import { makeSummaryProvider } from "../lib/summary.js";
import { getArtifactStorage, isLikelyLegacyAbsolutePath, normalizeStorageKey } from "../lib/storage.js";
import { workerLogger } from "../lib/logger.js";
import { recordWorkerAnalyticsEventBestEffort } from "../lib/analytics.js";
import { syncItemProjectionById, syncJobAndItemProjectionByJobId } from "../lib/metadata-projection.js";

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
  selectionDiagnostics?: HtmlExtractionSelectionDiagnostics | null;
};

type ClaimedDispatchJob = {
  id: string;
  itemId: string;
  userId: string;
  jobKind: string;
  attempt: number;
  status: string;
  lockedAt: Date | null;
  leaseId: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  lastHeartbeatAt: Date | null;
  dispatchMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
  item: {
    id: string;
    userId: string;
    title: string | null;
    sourceType: string;
    processingMode: string;
    sourceUrl: string | null;
    sourceFilePath: string | null;
    sourceHtml: string | null;
    user: {
      email: string | null;
      ttsProvider: string | null;
      ttsVoice: string | null;
    } | null;
  };
  dispatchMessage: ReservedDispatchQueueMessage | null;
};

type CompletedItemSummaryPatch = {
  summaryStatus: "SUCCEEDED";
  summaryTitle: string;
  summaryStorageKey: string;
  summaryBytes: number;
  summaryProvider: string;
  summaryModel: string;
  summaryDeployment: string | null;
  summaryInputTokens: number | null;
  summaryOutputTokens: number | null;
  summaryErrorCode: null;
  summaryErrorMessage: null;
  summaryCompletedAt: Date;
};

type SynthesizeEpisodeAudioOptions = {
  provider?: TtsProvider;
  maxSegmentAttempts?: number;
  segmentRetryBaseMs?: number;
};

const DEMO_TRACE_LIMIT = 10;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const PUBLISHED_AUDIO_FORMAT = "mp3" as const;
const DISPATCH_RECONCILE_INTERVAL_MS = 60_000;
const dispatchQueue = createWorkerItemDispatchQueue();
let lastDispatchReconcileAt = 0;

class LostJobLeaseError extends Error {
  constructor(message = "Processing lease no longer owned by this worker.") {
    super(message);
    this.name = "LostJobLeaseError";
  }
}

function now() {
  return new Date();
}

function generateStoreId(): string {
  return randomBytes(12).toString("hex");
}

function generateTraceId(): string {
  return randomBytes(16).toString("hex");
}

function generateSpanId(): string {
  return randomBytes(8).toString("hex");
}

function buildTtsCacheKey(
  userId: string,
  selection: { providerId: string; voice: string },
  chunks: ReturnType<typeof chunkText>
): string {
  return sha256([userId, selection.providerId, selection.voice, ...chunks.map((chunk) => chunk.hash)].join("|"));
}

async function findChunkCacheByHash(cacheKey: string) {
  return workerUsesAzureTablePrimary() && workerPrimaryStore
    ? workerPrimaryStore.findChunkCacheByHash(cacheKey)
    : prisma.chunkCache.findUnique({ where: { hash: cacheKey } });
}

function logNow() {
  return new Date().toISOString();
}

function jobLeaseDeadline(input: {
  leaseExpiresAt?: Date | null;
  lockedAt?: Date | null;
}): Date | null {
  if (input.leaseExpiresAt) {
    return input.leaseExpiresAt;
  }
  if (input.lockedAt) {
    return new Date(input.lockedAt.getTime() + workerEnv.staleProcessingMs);
  }
  return null;
}

function jobLeaseExpired(
  input: {
    leaseExpiresAt?: Date | null;
    lockedAt?: Date | null;
  },
  nowAt: Date
): boolean {
  const deadline = jobLeaseDeadline(input);
  return deadline !== null && deadline.getTime() <= nowAt.getTime();
}

function isRetryableJobStatus(input: {
  status: string;
  attempt: number;
  nextRetryAt?: Date | null;
}): boolean {
  return (
    input.status === "FAILED" &&
    input.attempt < workerEnv.maxRetryAttempts &&
    input.nextRetryAt != null &&
    input.nextRetryAt.getTime() <= Date.now()
  );
}

function jobIsEligibleForClaim(input: {
  status: string;
  attempt: number;
  scheduledFor?: Date | null;
  nextRetryAt?: Date | null;
  leaseExpiresAt?: Date | null;
  lockedAt?: Date | null;
}, nowAt: Date): boolean {
  if (input.status === "QUEUED") {
    return input.scheduledFor === null || input.scheduledFor === undefined || input.scheduledFor.getTime() <= nowAt.getTime();
  }
  if (input.status === "FAILED") {
    return input.attempt < workerEnv.maxRetryAttempts && input.nextRetryAt != null && input.nextRetryAt.getTime() <= nowAt.getTime();
  }
  if (input.status === "PROCESSING") {
    return jobLeaseExpired(input, nowAt);
  }
  return false;
}

function nextVisibleAtForJobState(input: {
  status: string;
  scheduledFor?: Date | null;
  nextRetryAt?: Date | null;
  leaseExpiresAt?: Date | null;
  lockedAt?: Date | null;
}, nowAt: Date): Date {
  if (input.status === "FAILED" && input.nextRetryAt && input.nextRetryAt.getTime() > nowAt.getTime()) {
    return input.nextRetryAt;
  }
  if (input.status === "QUEUED" && input.scheduledFor && input.scheduledFor.getTime() > nowAt.getTime()) {
    return input.scheduledFor;
  }
  if (input.status === "PROCESSING") {
    const leaseDeadline = jobLeaseDeadline(input);
    if (leaseDeadline && leaseDeadline.getTime() > nowAt.getTime()) {
      return new Date(leaseDeadline.getTime() + 5_000);
    }
  }
  return nowAt;
}

function nextLeaseExpiry(nowAt: Date): Date {
  return new Date(nowAt.getTime() + workerEnv.itemDispatchVisibilityMs);
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

function buildPersistedHtmlExtractionSelection(diagnostics: HtmlExtractionSelectionDiagnostics): {
  extractionEngine: string;
  extractionSelectionMode: string;
  extractionScoreMargin: number;
  extractionSummaryJson: string;
  extractionSelectionRecordedAt: Date;
} {
  const summary = summarizeHtmlExtractionSelection(diagnostics);
  return {
    extractionEngine: summary.selectedEngine,
    extractionSelectionMode: summary.selectionMode,
    extractionScoreMargin: summary.scoreMargin,
    extractionSummaryJson: JSON.stringify(summary),
    extractionSelectionRecordedAt: new Date()
  };
}

function retentionExpiryDate(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
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
  if (!input.isDemoUser || !workerEnv.demoExtractionTraceEnabled || workerUsesAzureTablePrimary()) {
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
  if (workerEnv.jobEventStorageMode === "off" || workerUsesAzureTablePrimary()) {
    return;
  }

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
  outputFormat: "mp3" | "m4a" = PUBLISHED_AUDIO_FORMAT,
  options?: SynthesizeEpisodeAudioOptions
): Promise<{ relativePath: string; bytes: number; mimeType: string }> {
  const provider = options?.provider ?? makeTtsProvider({ providerId: selection.providerId });
  const extension = outputFormat === "mp3" ? "mp3" : "m4a";
  const mimeType = outputFormat === "mp3" ? "audio/mpeg" : "audio/mp4";
  const relativePath = normalizeStorageKey(outputKey || join("items", itemId, `episode.${extension}`));
  const tempDir = await mkdtemp(join(tmpdir(), "articlepod-worker-"));
  const tempOutputPath = join(tempDir, `episode.${extension}`);
  const maxSegmentAttempts = Math.max(1, options?.maxSegmentAttempts ?? workerEnv.ttsSegmentMaxAttempts);
  const segmentRetryBaseMs = Math.max(0, options?.segmentRetryBaseMs ?? workerEnv.ttsSegmentRetryBaseMs);

  const synthesizeSegment = async (input: {
    text: string;
    outPath: string;
    segmentIndex: number;
    totalSegments: number;
  }) => {
    for (let attempt = 1; attempt <= maxSegmentAttempts; attempt += 1) {
      try {
        await provider.synthesizeToFile({
          text: input.text,
          voice: selection.voice,
          format: outputFormat,
          outPath: input.outPath
        });
        return;
      } catch (error) {
        const canRetry = attempt < maxSegmentAttempts && isRetryableTtsSegmentError(error);
        if (!canRetry) {
          throw error;
        }
        const delayMs = ttsSegmentRetryDelayMs(attempt, segmentRetryBaseMs);
        await workerLogger.warn("TTS segment synthesis failed; retrying", {
          itemId,
          providerId: selection.providerId,
          voice: selection.voice,
          segmentIndex: input.segmentIndex,
          totalSegments: input.totalSegments,
          attempt,
          maxAttempts: maxSegmentAttempts,
          delayMs,
          error: formatDiagnostic(error)
        });
        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }
    }
  };

  try {
    if (chunks.length === 1) {
      await synthesizeSegment({
        text: chunks[0]?.text ?? "",
        outPath: tempOutputPath,
        segmentIndex: 0,
        totalSegments: 1
      });
      if (onProgress) {
        await onProgress(1, 1);
      }
    } else {
      const segmentPaths: string[] = [];
      for (let index = 0; index < chunks.length; index += 1) {
        const segmentPath = join(tempDir, `segment-${index}.${extension}`);
        const segmentText = chunks[index]?.text ?? "";
        await synthesizeSegment({
          text: segmentText,
          outPath: segmentPath,
          segmentIndex: index,
          totalSegments: chunks.length
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

export function isRetryableTtsSegmentError(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return true;
  }
  if (error.code !== errorCodes.TTS_FAILED) {
    return false;
  }

  const message = error.userMessage.toLowerCase();
  if (message.includes("timed out") || message.includes("finalizing the episode")) {
    return false;
  }
  return error.status >= 500;
}

function ttsSegmentRetryDelayMs(attempt: number, baseDelayMs: number): number {
  if (baseDelayMs <= 0) {
    return 0;
  }
  const exponential = Math.min(30_000, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * Math.min(baseDelayMs, 1_000));
  return exponential + jitter;
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
      "Audio processing failed while finalizing the episode. Please retry.",
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

type StaleProcessingJob = {
  id: string;
  itemId: string;
  attempt: number;
};

type StaleProcessingReclaimResult = {
  requeued: number;
  failed: number;
};

function staleRetryMessage(): string {
  const staleMinutes = Math.max(1, Math.round(workerEnv.staleProcessingMs / 60_000));
  return `Retrying after ${staleMinutes} minutes without progress...`;
}

function buildRepeatedStallTimeoutError(): AppError {
  const staleMinutes = Math.max(1, Math.round(workerEnv.staleProcessingMs / 60_000));
  return new AppError(
    errorCodes.PROCESSING_TIMEOUT,
    `Processing stalled for ${staleMinutes} minutes without progress more than once and was stopped. Please retry.`,
    504
  );
}

function buildMaxProcessingTimeError(): AppError {
  const maxMinutes = Math.max(1, Math.round(workerEnv.maxProcessingMs / 60_000));
  return new AppError(
    errorCodes.PROCESSING_TIMEOUT,
    `Processing exceeded the ${maxMinutes}-minute safety limit and was stopped. Please retry.`,
    504
  );
}

function shouldFailStaleProcessingJob(job: StaleProcessingJob): AppError | null {
  if (job.attempt > workerEnv.maxStaleRetries) {
    return buildRepeatedStallTimeoutError();
  }
  return null;
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
    const canonicalized = await canonicalizeFetchableUrl(item.sourceUrl);
    const fetchUrl = canonicalized.canonicalUrl;
    const pinnedCandidates =
      canonicalized.resolvedIps && canonicalized.resolvedIps.length > 0
        ? canonicalized.resolvedIps
        : canonicalized.resolvedIp
          ? [canonicalized.resolvedIp]
          : [];
    appendExtractionLog(item.logs, "extract:url", "URL validation passed", {
      pinnedCandidateCount: pinnedCandidates.length,
      canonicalUrl: fetchUrl,
      canonicalized: canonicalized.redirected,
      redirectCount: canonicalized.redirectCount
    });
    if (canonicalized.redirected) {
      appendExtractionLog(item.logs, "extract:url", "Canonicalized submitted URL before extraction", {
        sourceUrl: item.sourceUrl,
        canonicalUrl: fetchUrl,
        redirectCount: canonicalized.redirectCount
      });
    }

    appendExtractionLog(item.logs, "extract:url", "Fetching and parsing HTML", {
      pinnedCandidateCount: pinnedCandidates.length,
      fetchUrl
    });

    let extracted: Awaited<ReturnType<typeof extractHtmlFromUrlWithDiagnostics>>;
    try {
      extracted = await extractHtmlFromUrlWithDiagnostics(fetchUrl, pinnedCandidates);
    } catch (error) {
      const fetchDiagnostics = getHtmlFetchDiagnostics(error);
      if (fetchDiagnostics) {
        appendExtractionLog(item.logs, "extract:url", "HTML extraction failed", {
          pinnedCandidateCount: fetchDiagnostics.pinnedCandidateCount,
          pinnedStatuses: fetchDiagnostics.pinnedStatuses,
          fallbackAttempted: fetchDiagnostics.fallbackAttempted,
          fallbackStatus: fetchDiagnostics.fallbackStatus,
          finalFetchStrategy: fetchDiagnostics.finalFetchStrategy
        });
      }
      throw error;
    }

    const extractedTitle = extracted.title ?? "";
    appendExtractionLog(item.logs, "extract:url", "HTML extraction complete", {
      extractedTitleLength: extractedTitle.length,
      extractedTextLength: extracted.text.length,
      pinnedCandidateCount: extracted.diagnostics.pinnedCandidateCount,
      pinnedStatuses: extracted.diagnostics.pinnedStatuses,
      fallbackAttempted: extracted.diagnostics.fallbackAttempted,
      fallbackStatus: extracted.diagnostics.fallbackStatus,
      finalFetchStrategy: extracted.diagnostics.finalFetchStrategy,
      extractionSelection: summarizeHtmlExtractionSelection(extracted.selectionDiagnostics)
    });

    return {
      title: extractedTitle,
      text: extracted.text,
      markdown: extracted.markdown,
      sourceLabel: fetchUrl,
      sourceArtifact: {
        kind: "RAW_HTML",
        storageKey: normalizeStorageKey(join("items", item.id, "artifacts", "source.html")),
        contentType: "text/html; charset=utf-8",
        bytes: Buffer.from(extracted.rawHtml, "utf8"),
        expiresAt: retentionExpiryDate(workerEnv.rawArtifactRetentionDays)
      },
      selectionDiagnostics: extracted.selectionDiagnostics
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
      extractedTextLength: extracted.text.length,
      extractionSelection: summarizeHtmlExtractionSelection(extracted.selectionDiagnostics)
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
      },
      selectionDiagnostics: extracted.selectionDiagnostics
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
    },
    selectionDiagnostics: null
  };
}

async function loadStoredMarkdownArtifact(itemId: string): Promise<{ markdown: string; storageKey: string; bytes: number } | null> {
  const artifact =
    workerUsesAzureTablePrimary() && workerPrimaryStore
      ? (await workerPrimaryStore.listItemArtifacts(itemId, "MARKDOWN"))[0]
      : await prisma.itemArtifact.findFirst({
          where: {
            itemId,
            kind: "MARKDOWN"
          }
        });

  if (!artifact) {
    return null;
  }

  const content = await getArtifactStorage()
    .getObject(artifact.storageKey)
    .catch(() => null);
  if (!content) {
    return null;
  }

  return {
    markdown: cleanExtractedMarkdown(content.toString("utf8")),
    storageKey: artifact.storageKey,
    bytes: artifact.byteLength
  };
}

function buildPlainTextSummaryMarkdown(title: string, plainText: string): string {
  const heading = title.trim() || "Summarized transcript";
  const body = plainText.trim() || "The original source was too long to fit into one podcast episode.";
  return [`# ${heading}`, "", body].join("\n");
}

function buildDeterministicLongSourceSummary(input: {
  title: string;
  sourceNarrationText: string;
  maxChunks: number;
  chunkMaxChars: number;
}): {
  summary: DigestSummaryResponse;
  narrationText: string;
  chunks: ReturnType<typeof chunkText>;
  wasClamped: boolean;
  originalChunkCount: number;
} {
  const fallbackBody = [
    "Here is an abridged version of the source, condensed to fit this podcast episode.",
    input.sourceNarrationText.trim()
  ]
    .filter(Boolean)
    .join("\n\n");
  const fitted = fitLongSourceSummaryNarration({
    summaryBody: fallbackBody,
    maxChunks: Math.max(1, Math.min(input.maxChunks, 8)),
    chunkMaxChars: input.chunkMaxChars
  });
  const title = input.title.trim() || "Summarized transcript";
  const plainText = fitted.summaryBody || "The original source was too long to fit into one podcast episode.";

  return {
    summary: {
      title,
      markdown: buildPlainTextSummaryMarkdown(title, plainText),
      plainText,
      provider: "deterministic",
      model: "long-source-abridged-v1",
      deployment: null,
      inputTokens: null,
      outputTokens: null
    },
    narrationText: fitted.narrationText,
    chunks: fitted.chunks,
    wasClamped: fitted.wasClamped,
    originalChunkCount: fitted.originalChunkCount
  };
}

export function shouldRecommendRetry(error: Pick<AppError, "code" | "userMessage">): boolean {
  const message = error.userMessage.toLowerCase();
  if (error.code === errorCodes.PROCESSING_TIMEOUT) {
    return false;
  }
  if (error.code === errorCodes.TTS_FAILED && message.includes("finalizing the episode")) {
    return false;
  }
  if (error.code === errorCodes.TTS_FAILED && message.includes("timed out")) {
    return false;
  }
  if (error.code === errorCodes.EXTRACTION_FAILED && message.includes("blocked server-side access")) {
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
      "Audio processing failed. Please retry.",
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

async function reclaimStaleProcessingJobs(): Promise<StaleProcessingReclaimResult> {
  const staleBefore = new Date(Date.now() - workerEnv.staleProcessingMs);
  if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
    const staleJobs = await workerPrimaryStore.listStaleJobs(staleBefore);
    if (staleJobs.length === 0) {
      return { requeued: 0, failed: 0 };
    }

    let requeued = 0;
    let failed = 0;
    for (const job of staleJobs) {
      const terminalError = shouldFailStaleProcessingJob(job);
      const updated = await workerPrimaryStore.updateJob(job.id, {
        status: "FAILED",
        lockedAt: null,
        nextRetryAt: terminalError ? null : new Date(),
        errorCode: terminalError?.code ?? null,
        errorMessage: terminalError?.userMessage ?? null
      });
      if (!updated || updated.status !== "FAILED" || updated.lockedAt !== null) {
        continue;
      }
      if (terminalError) {
        await workerPrimaryStore.updateItem(job.itemId, {
          status: "FAILED",
          errorCode: terminalError.code,
          errorMessage: terminalError.userMessage
        });
        failed++;
      } else {
        await workerPrimaryStore.updateItem(job.itemId, {
          status: "QUEUED",
          errorCode: null,
          errorMessage: staleRetryMessage()
        });
        requeued++;
      }
      await syncJobAndItemProjectionByJobId(job.id);
    }
    return { requeued, failed };
  }

  const staleJobs = await prisma.job.findMany({
    where: {
      status: "PROCESSING",
      lockedAt: {
        lt: staleBefore
      }
    },
    select: {
      id: true,
      itemId: true,
      attempt: true
    }
  });

  if (staleJobs.length === 0) {
    return { requeued: 0, failed: 0 };
  }

  let requeued = 0;
  let failed = 0;
  for (const job of staleJobs) {
    const terminalError = shouldFailStaleProcessingJob(job);
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Re-check status inside transaction to prevent double-reclaim race
        await tx.job.update({
          where: { id: job.id, status: "PROCESSING", lockedAt: { lt: staleBefore } },
          data: {
            status: "FAILED",
            lockedAt: null,
            nextRetryAt: terminalError ? null : new Date(),
            errorCode: terminalError?.code ?? null,
            errorMessage: terminalError?.userMessage ?? null
          }
        });

        await tx.item.updateMany({
          where: {
            id: job.itemId,
            status: "PROCESSING"
          },
          data: {
            status: terminalError ? "FAILED" : "QUEUED",
            errorCode: terminalError?.code ?? null,
            errorMessage: terminalError?.userMessage ?? staleRetryMessage()
          }
        });
      });
      if (terminalError) {
        failed++;
      } else {
        requeued++;
      }
      await syncJobAndItemProjectionByJobId(job.id);
    } catch {
      // Job was already claimed by another worker instance — skip it
    }
  }

  return { requeued, failed };
}

async function settleDispatchMessageForCurrentJobState(dispatchMessage: ReservedDispatchQueueMessage): Promise<void> {
  const nowAt = now();
  const currentJob =
    workerUsesAzureTablePrimary() && workerPrimaryStore
      ? await workerPrimaryStore.findJobById(dispatchMessage.jobId)
      : await prisma.job.findUnique({
          where: { id: dispatchMessage.jobId },
          select: {
            id: true,
            status: true,
            attempt: true,
            scheduledFor: true,
            nextRetryAt: true,
            lockedAt: true,
            leaseExpiresAt: true
          }
        });

  if (!currentJob) {
    await dispatchQueue.delete({
      messageId: dispatchMessage.messageId,
      receipt: dispatchMessage.receipt
    });
    return;
  }

  const terminal =
    currentJob.status === "SUCCEEDED" ||
    (currentJob.status === "FAILED" &&
      (currentJob.attempt >= workerEnv.maxRetryAttempts || currentJob.nextRetryAt === null));

  if (terminal) {
    await dispatchQueue.delete({
      messageId: dispatchMessage.messageId,
      receipt: dispatchMessage.receipt
    });
    return;
  }

  await dispatchQueue.release({
    messageId: dispatchMessage.messageId,
    receipt: dispatchMessage.receipt,
    jobId: dispatchMessage.jobId,
    kind: dispatchMessage.kind,
    visibleAt: nextVisibleAtForJobState(currentJob, nowAt),
    reservedBy: workerEnv.workerInstanceId
  });
}

async function deleteDispatchMessage(claimResult: ClaimedDispatchJob): Promise<void> {
  if (!claimResult.dispatchMessage) {
    return;
  }
  const deleted = await dispatchQueue.delete({
    messageId: claimResult.dispatchMessage.messageId,
    receipt: claimResult.dispatchMessage.receipt
  });
  if (!deleted) {
    await workerLogger.warn("Dispatch message delete failed; a later worker will reconcile it", {
      jobId: claimResult.id,
      itemId: claimResult.itemId,
      messageId: claimResult.dispatchMessage.messageId
    });
  }
}

async function releaseDispatchMessage(claimResult: ClaimedDispatchJob, visibleAt: Date): Promise<void> {
  if (!claimResult.dispatchMessage) {
    return;
  }
  const updated = await dispatchQueue.release({
    messageId: claimResult.dispatchMessage.messageId,
    receipt: claimResult.dispatchMessage.receipt,
    jobId: claimResult.dispatchMessage.jobId,
    kind: claimResult.dispatchMessage.kind,
    visibleAt,
    reservedBy: workerEnv.workerInstanceId
  });
  if (updated) {
    claimResult.dispatchMessage = updated;
    return;
  }
  await workerLogger.warn("Dispatch message release failed; message will reappear on its existing timeout", {
    jobId: claimResult.id,
    itemId: claimResult.itemId,
    messageId: claimResult.dispatchMessage.messageId
  });
}

async function renewClaimLease(claimResult: ClaimedDispatchJob, progressMessage?: string): Promise<void> {
  const heartbeatAt = new Date();
  const leaseExpiresAt = nextLeaseExpiry(heartbeatAt);

  if (claimResult.dispatchMessage) {
    const renewedDispatch = await dispatchQueue.renew({
      messageId: claimResult.dispatchMessage.messageId,
      receipt: claimResult.dispatchMessage.receipt,
      jobId: claimResult.dispatchMessage.jobId,
      kind: claimResult.dispatchMessage.kind,
      visibleAt: leaseExpiresAt,
      reservedBy: workerEnv.workerInstanceId
    });
    if (!renewedDispatch) {
      throw new LostJobLeaseError("Dispatch message reservation was lost.");
    }
    claimResult.dispatchMessage = renewedDispatch;
  }

  if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
    const updated = await workerPrimaryStore.updateJobIfLeaseMatches(claimResult.id, claimResult.leaseId ?? "", {
      lockedAt: heartbeatAt,
      leaseOwner: workerEnv.workerInstanceId,
      leaseExpiresAt,
      lastHeartbeatAt: heartbeatAt
    });
    if (!updated) {
      throw new LostJobLeaseError();
    }
    if (progressMessage) {
      await workerPrimaryStore.updateItem(claimResult.item.id, {
        errorMessage: progressMessage
      });
    }
    claimResult.lockedAt = heartbeatAt;
    claimResult.leaseExpiresAt = leaseExpiresAt;
    claimResult.lastHeartbeatAt = heartbeatAt;
    return;
  }

  const updated = await prisma.job.updateMany({
    where: {
      id: claimResult.id,
      leaseId: claimResult.leaseId,
      status: "PROCESSING"
    },
    data: {
      lockedAt: heartbeatAt,
      leaseOwner: workerEnv.workerInstanceId,
      leaseExpiresAt,
      lastHeartbeatAt: heartbeatAt
    }
  });
  if (updated.count !== 1) {
    throw new LostJobLeaseError();
  }
  if (progressMessage) {
    await prisma.item.updateMany({
      where: {
        id: claimResult.item.id,
        status: "PROCESSING"
      },
      data: {
        errorMessage: progressMessage
      }
    });
  }
  claimResult.lockedAt = heartbeatAt;
  claimResult.leaseExpiresAt = leaseExpiresAt;
  claimResult.lastHeartbeatAt = heartbeatAt;
}

async function reconcileMissingItemDispatchMessages(force = false): Promise<number> {
  if (workerEnv.workerRole !== "primary") {
    return 0;
  }

  const nowAt = now();
  if (!force && nowAt.getTime() - lastDispatchReconcileAt < DISPATCH_RECONCILE_INTERVAL_MS) {
    return 0;
  }
  lastDispatchReconcileAt = nowAt.getTime();

  if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
    const candidates = (await workerPrimaryStore.listNextEligibleJobs(
      nowAt,
      workerEnv.maxRetryAttempts,
      workerEnv.staleProcessingMs
    ))
      .filter((job) => !job.dispatchMessageId)
      .slice(0, 50);
    let reconciled = 0;
    for (const job of candidates) {
      try {
        const dispatchMessage = await dispatchQueue.enqueue({
          jobId: job.id,
          kind: "ITEM",
          visibleAt: nextVisibleAtForJobState(job, nowAt)
        });
        await workerPrimaryStore.updateJob(job.id, {
          dispatchMessageId: dispatchMessage.messageId
        });
        reconciled += 1;
      } catch (error) {
        await workerLogger.warn("Failed to reconcile missing item dispatch message", {
          jobId: job.id,
          itemId: job.itemId,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        });
      }
    }
    return reconciled;
  }

  const candidates = await prisma.job.findMany({
    where: {
      dispatchMessageId: null,
      OR: [
        {
          status: "QUEUED",
          OR: [{ scheduledFor: null }, { scheduledFor: { lte: nowAt } }]
        },
        {
          status: "FAILED",
          nextRetryAt: { lte: nowAt },
          attempt: { lt: workerEnv.maxRetryAttempts }
        },
        {
          status: "PROCESSING",
          OR: [{ leaseExpiresAt: { lte: nowAt } }, { leaseExpiresAt: null, lockedAt: { lte: nowAt } }]
        }
      ]
    },
    orderBy: [{ createdAt: "asc" }],
    take: 50,
    select: {
      id: true,
      itemId: true,
      status: true,
      scheduledFor: true,
      nextRetryAt: true,
      leaseExpiresAt: true,
      lockedAt: true
    }
  });

  let reconciled = 0;
  for (const job of candidates) {
    try {
      const dispatchMessage = await dispatchQueue.enqueue({
        jobId: job.id,
        kind: "ITEM",
        visibleAt: nextVisibleAtForJobState(job, nowAt)
      });
      await prisma.job.updateMany({
        where: {
          id: job.id,
          dispatchMessageId: null
        },
        data: {
          dispatchMessageId: dispatchMessage.messageId
        }
      });
      reconciled += 1;
    } catch (error) {
      await workerLogger.warn("Failed to reconcile missing item dispatch message", {
        jobId: job.id,
        itemId: job.itemId,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      });
    }
  }
  return reconciled;
}

async function updateClaimProgressMessage(claimResult: ClaimedDispatchJob, progressMessage: string): Promise<void> {
  if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
    await workerPrimaryStore.updateItem(claimResult.item.id, {
      errorMessage: progressMessage
    });
    return;
  }

  await prisma.item.updateMany({
    where: {
      id: claimResult.item.id,
      status: "PROCESSING"
    },
    data: {
      errorMessage: progressMessage
    }
  });
}

async function claimReservedItemJob(
  jobId: string,
  dispatchMessage: ReservedDispatchQueueMessage | null
): Promise<ClaimedDispatchJob | null> {
  const claimAt = now();
  const leaseId = randomUUID();
  const leaseExpiresAt = nextLeaseExpiry(claimAt);

  if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
    const claimed = await workerPrimaryStore.claimJob({
      jobId,
      now: claimAt,
      maxRetryAttempts: workerEnv.maxRetryAttempts,
      staleProcessingMs: workerEnv.staleProcessingMs,
      leaseId,
      leaseOwner: workerEnv.workerInstanceId,
      leaseExpiresAt,
      dispatchMessageId: dispatchMessage?.messageId
    });
    if (!claimed) {
      return null;
    }

    const [item, user] = await Promise.all([
      workerPrimaryStore.findItemById(claimed.itemId),
      workerPrimaryStore.findUserById(claimed.userId)
    ]);
    if (!item) {
      await workerPrimaryStore.updateJobIfLeaseMatches(claimed.id, leaseId, {
        status: "FAILED",
        lockedAt: null,
        clearLease: true,
        lastHeartbeatAt: claimAt,
        errorCode: errorCodes.INTERNAL_ERROR,
        errorMessage: "Source item no longer exists."
      });
      if (dispatchMessage) {
        await dispatchQueue.delete({
          messageId: dispatchMessage.messageId,
          receipt: dispatchMessage.receipt
        });
      }
      return null;
    }

    await workerPrimaryStore.updateItem(item.id, {
      status: "PROCESSING",
      errorCode: null,
      errorMessage: "Processing in progress..."
    });

    return {
      ...claimed,
      item: {
        ...item,
        user: user
          ? {
              email: user.email,
              ttsProvider: user.ttsProvider,
              ttsVoice: user.ttsVoice
            }
          : null
      },
      dispatchMessage
    };
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const next = await tx.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        itemId: true,
        jobKind: true,
        attempt: true,
        status: true,
        lockedAt: true,
        leaseId: true,
        leaseOwner: true,
        leaseExpiresAt: true,
        lastHeartbeatAt: true,
        dispatchMessageId: true,
        scheduledFor: true,
        nextRetryAt: true,
        createdAt: true,
        updatedAt: true,
        item: {
          select: {
            id: true,
            title: true,
            userId: true,
            sourceType: true,
            processingMode: true,
            sourceUrl: true,
            sourceFilePath: true,
            sourceHtml: true,
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

    if (!next || !jobIsEligibleForClaim(next, claimAt)) {
      return null;
    }

    const claimed = await tx.job.updateMany({
      where: {
        id: next.id,
        updatedAt: next.updatedAt
      },
      data: {
        status: "PROCESSING",
        lockedAt: claimAt,
        attempt: next.attempt + 1,
        leaseId,
        leaseOwner: workerEnv.workerInstanceId,
        leaseExpiresAt,
        lastHeartbeatAt: claimAt,
        dispatchMessageId: dispatchMessage?.messageId ?? next.dispatchMessageId,
        errorCode: null,
        errorMessage: null
      }
    });

    if (claimed.count !== 1) {
      return null;
    }

    await tx.item.update({
      where: { id: next.itemId },
      data: {
        status: "PROCESSING",
        errorCode: null,
        errorMessage: "Processing in progress..."
      }
    });

    return {
      id: next.id,
      itemId: next.itemId,
      userId: next.item.userId,
      jobKind: next.jobKind,
      attempt: next.attempt + 1,
      status: "PROCESSING",
      lockedAt: claimAt,
      leaseId,
      leaseOwner: workerEnv.workerInstanceId,
      leaseExpiresAt,
      lastHeartbeatAt: claimAt,
      dispatchMessageId: dispatchMessage?.messageId ?? next.dispatchMessageId,
      createdAt: next.createdAt,
      updatedAt: claimAt,
      item: next.item,
      dispatchMessage
    };
  });
}

async function handleExpiredProcessingReservation(dispatchMessage: ReservedDispatchQueueMessage): Promise<"continue" | "unhandled"> {
  const nowAt = now();
  const staleBefore = new Date(nowAt.getTime() - workerEnv.staleProcessingMs);
  const currentJob =
    workerUsesAzureTablePrimary() && workerPrimaryStore
      ? await workerPrimaryStore.findJobById(dispatchMessage.jobId)
      : await prisma.job.findUnique({
          where: { id: dispatchMessage.jobId },
          select: {
            id: true,
            itemId: true,
            attempt: true,
            status: true,
            lockedAt: true,
            leaseId: true,
            leaseOwner: true,
            leaseExpiresAt: true,
            lastHeartbeatAt: true,
            dispatchMessageId: true,
            updatedAt: true
          }
        });

  if (!currentJob) {
    await dispatchQueue.delete({
      messageId: dispatchMessage.messageId,
      receipt: dispatchMessage.receipt
    });
    return "continue";
  }

  if (currentJob.status !== "PROCESSING" || !jobLeaseExpired(currentJob, nowAt)) {
    return "unhandled";
  }

  const terminalError = shouldFailStaleProcessingJob({
    id: currentJob.id,
    itemId: currentJob.itemId,
    attempt: currentJob.attempt
  });

  if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
    const updatedJob =
      currentJob.leaseId
        ? await workerPrimaryStore.updateJobIfLeaseMatches(currentJob.id, currentJob.leaseId, {
            status: "FAILED",
            lockedAt: null,
            clearLease: true,
            lastHeartbeatAt: nowAt,
            dispatchMessageId: null,
            nextRetryAt: terminalError ? null : nowAt,
            errorCode: terminalError?.code ?? null,
            errorMessage: terminalError?.userMessage ?? null
          })
        : await workerPrimaryStore.updateJob(currentJob.id, {
            status: "FAILED",
            lockedAt: null,
            leaseId: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastHeartbeatAt: nowAt,
            dispatchMessageId: null,
            nextRetryAt: terminalError ? null : nowAt,
            errorCode: terminalError?.code ?? null,
            errorMessage: terminalError?.userMessage ?? null
          });

    if (!updatedJob) {
      await settleDispatchMessageForCurrentJobState(dispatchMessage);
      return "continue";
    }

    await workerPrimaryStore.updateItem(currentJob.itemId, {
      status: terminalError ? "FAILED" : "QUEUED",
      errorCode: terminalError?.code ?? null,
      errorMessage: terminalError?.userMessage ?? staleRetryMessage()
    });

    await dispatchQueue.delete({
      messageId: dispatchMessage.messageId,
      receipt: dispatchMessage.receipt
    });

    if (!terminalError) {
      try {
        const replacement = await dispatchQueue.enqueue({
          jobId: currentJob.id,
          kind: "ITEM",
          visibleAt: nowAt
        });
        await workerPrimaryStore.updateJob(currentJob.id, {
          dispatchMessageId: replacement.messageId
        });
      } catch (error) {
        await workerLogger.warn("Failed to replace dispatch message for stale job retry; reconciliation will retry later", {
          jobId: currentJob.id,
          itemId: currentJob.itemId,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        });
      }
    }

    await syncJobAndItemProjectionByJobId(currentJob.id);
    return "continue";
  }

  const persisted = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updatedJob = await tx.job.updateMany({
      where: {
        id: currentJob.id,
        status: "PROCESSING",
        updatedAt: currentJob.updatedAt,
        OR: [{ leaseExpiresAt: { lte: nowAt } }, { leaseExpiresAt: null, lockedAt: { lte: staleBefore } }]
      },
      data: {
        status: "FAILED",
        lockedAt: null,
        leaseId: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: nowAt,
        dispatchMessageId: null,
        nextRetryAt: terminalError ? null : nowAt,
        errorCode: terminalError?.code ?? null,
        errorMessage: terminalError?.userMessage ?? null
      }
    });

    if (updatedJob.count !== 1) {
      return false;
    }

    await tx.item.updateMany({
      where: { id: currentJob.itemId },
      data: {
        status: terminalError ? "FAILED" : "QUEUED",
        errorCode: terminalError?.code ?? null,
        errorMessage: terminalError?.userMessage ?? staleRetryMessage()
      }
    });

    return true;
  });

  if (!persisted) {
    await settleDispatchMessageForCurrentJobState(dispatchMessage);
    return "continue";
  }

  await dispatchQueue.delete({
    messageId: dispatchMessage.messageId,
    receipt: dispatchMessage.receipt
  });

  if (!terminalError) {
    try {
      const replacement = await dispatchQueue.enqueue({
        jobId: currentJob.id,
        kind: "ITEM",
        visibleAt: nowAt
      });
      await prisma.job.updateMany({
        where: {
          id: currentJob.id,
          dispatchMessageId: null
        },
        data: {
          dispatchMessageId: replacement.messageId
        }
      });
    } catch (error) {
      await workerLogger.warn("Failed to replace dispatch message for stale job retry; reconciliation will retry later", {
        jobId: currentJob.id,
        itemId: currentJob.itemId,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      });
    }
  }

  await syncJobAndItemProjectionByJobId(currentJob.id);
  return "continue";
}

export async function processJob(jobId: string, dispatchMessage: ReservedDispatchQueueMessage | null = null): Promise<boolean> {
  const claimResult = await claimReservedItemJob(jobId, dispatchMessage);
  if (!claimResult) {
    if (dispatchMessage) {
      await settleDispatchMessageForCurrentJobState(dispatchMessage);
    }
    return false;
  }

  await syncJobAndItemProjectionByJobId(claimResult.id);

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
  let heartbeatInterval: NodeJS.Timeout | null = null;
  let heartbeatFailure: unknown = null;
  let heartbeatInFlight = false;

  const recordHeartbeatFailure = (error: unknown) => {
    if (!heartbeatFailure) {
      heartbeatFailure =
        error instanceof LostJobLeaseError || error instanceof Error
          ? error
          : new LostJobLeaseError(toSafeErrorMessage(error));
    }
  };

  const assertLeaseHealthy = () => {
    if (!heartbeatFailure) {
      return;
    }
    if (heartbeatFailure instanceof Error) {
      throw heartbeatFailure;
    }
    throw new LostJobLeaseError();
  };

  const runLeaseHeartbeat = async () => {
    if (heartbeatInFlight) {
      return;
    }
    heartbeatInFlight = true;
    try {
      await renewClaimLease(claimResult);
    } catch (error) {
      recordHeartbeatFailure(error);
    } finally {
      heartbeatInFlight = false;
    }
  };

  heartbeatInterval = setInterval(() => {
    void runLeaseHeartbeat();
  }, workerEnv.itemDispatchHeartbeatMs);
  heartbeatInterval.unref?.();

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
        attempt: claimResult.attempt,
        leaseId: claimResult.leaseId,
        workerInstanceId: workerEnv.workerInstanceId,
        dispatchMessageId: claimResult.dispatchMessage?.messageId ?? claimResult.dispatchMessageId
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

  const claimedJobKind = (claimResult.jobKind || item.processingMode || "FULL_EPISODE") as ItemJobKind;
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
    const itemJobKind = claimedJobKind;
    const storedMarkdownArtifact = itemJobKind === "REQUEST_TTS" ? await loadStoredMarkdownArtifact(item.id) : null;
    const extraction = storedMarkdownArtifact
      ? {
          title: item.title?.trim() || "",
          text: markdownToNarrationText(storedMarkdownArtifact.markdown),
          markdown: storedMarkdownArtifact.markdown,
          sourceLabel: item.sourceUrl || "Stored article markdown",
          sourceArtifact: null,
          selectionDiagnostics: null
        }
      : await extractItemText({
          id: item.id,
          sourceType: item.sourceType,
          sourceUrl: item.sourceUrl,
          sourceFilePath: item.sourceFilePath,
          sourceHtml: item.sourceHtml,
          logs: extractionLogs
        });
    const cleanedMarkdown = cleanExtractedMarkdown(extraction.markdown);
    const persistedHtmlExtractionSelection = extraction.selectionDiagnostics
      ? buildPersistedHtmlExtractionSelection(extraction.selectionDiagnostics)
      : null;
    sourceLabelForDiagnostics = extraction.sourceLabel;
    extractedTextForDiagnostics = extraction.text;
    extractedMarkdownForDiagnostics = cleanedMarkdown;
    assertLeaseHealthy();
    appendExtractionLog(extractionLogs, "extract", "Cleaned extracted markdown", {
      originalBytes: Buffer.byteLength(extraction.markdown, "utf8"),
      cleanedBytes: Buffer.byteLength(cleanedMarkdown, "utf8")
    });
    if (storedMarkdownArtifact) {
      appendExtractionLog(extractionLogs, "extract", "Loaded existing markdown artifact for requested TTS", {
        storageKey: storedMarkdownArtifact.storageKey,
        bytes: storedMarkdownArtifact.bytes
      });
    }

    if (extraction.sourceArtifact) {
      const storedRaw = await getArtifactStorage().putObject(extraction.sourceArtifact.storageKey, extraction.sourceArtifact.bytes, {
        contentType: extraction.sourceArtifact.contentType
      });
      if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
        await workerPrimaryStore.upsertItemArtifact({
          id: generateStoreId(),
          itemId: item.id,
          kind: extraction.sourceArtifact.kind,
          storageKey: storedRaw.key,
          contentType: extraction.sourceArtifact.contentType,
          byteLength: storedRaw.bytes,
          expiresAt: extraction.sourceArtifact.expiresAt
        });
      } else {
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
      }
      appendExtractionLog(extractionLogs, "extract", "Source artifact persisted", {
        kind: extraction.sourceArtifact.kind,
        storageKey: storedRaw.key,
        bytes: storedRaw.bytes
      });
    }

    if (!storedMarkdownArtifact) {
      const markdownStorageKey = buildUserItemMarkdownStorageKey(item.userId, item.id);
      const markdownStored = await getArtifactStorage().putObject(markdownStorageKey, Buffer.from(cleanedMarkdown, "utf8"), {
        contentType: "text/markdown; charset=utf-8"
      });
      if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
        await workerPrimaryStore.upsertItemArtifact({
          id: generateStoreId(),
          itemId: item.id,
          kind: "MARKDOWN",
          storageKey: markdownStored.key,
          contentType: "text/markdown; charset=utf-8",
          byteLength: markdownStored.bytes,
          expiresAt: null
        });
      } else {
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
      }
      appendExtractionLog(extractionLogs, "extract", "Markdown artifact persisted", {
        storageKey: markdownStored.key,
        bytes: markdownStored.bytes
      });
    }

    if (persistedHtmlExtractionSelection) {
      if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
        await workerPrimaryStore.updateItem(item.id, persistedHtmlExtractionSelection);
      } else {
        await prisma.item.update({
          where: { id: item.id },
          data: persistedHtmlExtractionSelection
        });
      }
      appendExtractionLog(extractionLogs, "extract", "Stored HTML extraction selection summary", {
        selectedEngine: persistedHtmlExtractionSelection.extractionEngine,
        selectionMode: persistedHtmlExtractionSelection.extractionSelectionMode,
        scoreMargin: persistedHtmlExtractionSelection.extractionScoreMargin
      });
    }

    const userProvidedTitle = item.title?.trim() || "";
    const narrationText = markdownToNarrationText(cleanedMarkdown);
    if (!hasNarratableText(narrationText)) {
      throw new AppError(errorCodes.EXTRACTION_EMPTY, lowSignalExtractionMessage, 400);
    }
    const resolvedTitle = userProvidedTitle || resolveEpisodeTitle(extraction.title, narrationText);
    appendExtractionLog(extractionLogs, "extract", "Title resolved", {
      usedUserProvidedTitle: Boolean(userProvidedTitle),
      resolvedTitle
    });

    if (itemJobKind === "SUMMARY_ONLY") {
      stage = "persist";
      await renewClaimLease(claimResult, "Creating article summary...");
      assertLeaseHealthy();
      const summaryProvider = makeSummaryProvider();
      const sourceType =
        item.sourceType === "URL" || item.sourceType === "PDF" || item.sourceType === "HTML_SNAPSHOT" ? item.sourceType : "URL";
      const summary = await summaryProvider.summarize({
        kind: "item_summary",
        cadence: "DAILY",
        timezone: "UTC",
        periodKey: item.id,
        windowStart: claimResult.createdAt,
        windowEnd: now(),
        targetLengthMinutes: 5,
        targetWords: digestTargetWords(5),
        requestedTitle: resolvedTitle,
        sources: [
          {
            itemId: item.id,
            title: resolvedTitle,
            sourceType,
            sourceUrl: item.sourceUrl,
            createdAt: claimResult.createdAt,
            markdown: cleanedMarkdown
          }
        ]
      });
      const summaryStorageKey = buildUserItemSummaryStorageKey(item.userId, item.id);
      const storedSummary = await getArtifactStorage().putObject(summaryStorageKey, Buffer.from(summary.markdown, "utf8"), {
        contentType: "text/markdown; charset=utf-8"
      });
      const completedAt = now();
      const textHash = sha256([item.userId, item.id, cleanedMarkdown, summary.markdown].join("|"));

      if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
        await workerPrimaryStore.updateItem(item.id, {
          title: resolvedTitle,
          status: "READY",
          processingMode: "SUMMARY_ONLY",
          textHash,
          sourceHtml: item.sourceType === "HTML_SNAPSHOT" ? null : undefined,
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
        const completedJob = await workerPrimaryStore.updateJobIfLeaseMatches(claimResult.id, claimResult.leaseId ?? "", {
          status: "SUCCEEDED",
          errorCode: null,
          errorMessage: null,
          lockedAt: null,
          nextRetryAt: null,
          lastHeartbeatAt: completedAt,
          clearLease: true
        });
        if (!completedJob) {
          throw new LostJobLeaseError();
        }
      } else {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const completedJob = await tx.job.updateMany({
            where: {
              id: claimResult.id,
              leaseId: claimResult.leaseId,
              status: "PROCESSING"
            },
            data: {
              status: "SUCCEEDED",
              lockedAt: null,
              leaseId: null,
              leaseOwner: null,
              leaseExpiresAt: null,
              lastHeartbeatAt: completedAt,
              nextRetryAt: null,
              errorCode: null,
              errorMessage: null
            }
          });
          if (completedJob.count !== 1) {
            throw new LostJobLeaseError();
          }

          await tx.item.update({
            where: { id: item.id },
            data: {
              title: resolvedTitle,
              status: "READY",
              processingMode: "SUMMARY_ONLY",
              textHash,
              sourceHtml: item.sourceType === "HTML_SNAPSHOT" ? null : undefined,
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
        });
      }
      appendExtractionLog(extractionLogs, "persist", "Item summary persisted", {
        storageKey: storedSummary.key,
        bytes: storedSummary.bytes
      });
      await deleteDispatchMessage(claimResult);

      await appendJobEvent({
        jobId: claimResult.id,
        itemId: item.id,
        stage: "job",
        eventType: "success",
        message: "Summary processing completed"
      });
      appendExtractionLog(extractionLogs, "job", "Summary job completed successfully");
      await workerLogger.info("Summary-only item job completed", {
        status: "SUCCEEDED",
        sourceType: item.sourceType,
        summaryProvider: summary.provider,
        summaryModel: summary.model,
        summaryDeployment: summary.deployment
      });

      const processingDurationMs = Math.max(0, completedAt.getTime() - lockedAtMs);
      await recordWorkerAnalyticsEventBestEffort({
        eventType: "ITEM_READY",
        userId: item.userId,
        itemId: item.id,
        sourceType,
        dedupeKey: `item_ready:${item.id}`,
        occurredAt: completedAt,
        metadata: {
          queue_wait_ms: queueWaitMs,
          processing_duration_ms: processingDurationMs,
          job_id: claimResult.id,
          processing_mode: "SUMMARY_ONLY"
        }
      });

      await syncJobAndItemProjectionByJobId(claimResult.id);
      return true;
    }

    let episodeNarrationText = narrationText;
    let chunks = chunkText(episodeNarrationText, workerEnv.ttsChunkMaxChars);
    let automaticSummaryItemPatch: CompletedItemSummaryPatch | null = null;
    if (chunks.length === 0) {
      throw new AppError(errorCodes.EXTRACTION_EMPTY, lowSignalExtractionMessage, 400);
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

    let cacheKey = buildTtsCacheKey(item.userId, ttsSelection, chunks);
    let cacheHit = await findChunkCacheByHash(cacheKey);

    let audio: { relativePath: string; bytes: number; mimeType: string };
    if (!cacheHit && shouldSummarizeLongSource(chunks.length, workerEnv.ttsMaxChunks)) {
      const originalChunkCount = chunks.length;
      await workerLogger.warn("Narration exceeds configured audio chunk limit; generating summarized podcast", {
        chunkCount: originalChunkCount,
        maxChunks: workerEnv.ttsMaxChunks,
        sourceType: item.sourceType
      });
      appendExtractionLog(extractionLogs, "tts", "Narration exceeds chunk limit; generating summarized podcast", {
        chunkCount: originalChunkCount,
        maxChunks: workerEnv.ttsMaxChunks,
        chunkMaxChars: workerEnv.ttsChunkMaxChars
      });

      stage = "tts";
      await renewClaimLease(claimResult, "Creating summarized podcast...");
      assertLeaseHealthy();

      const summaryProvider = makeSummaryProvider();
      const preferredTargetLengthMinutes = automaticSummaryTargetLengthMinutes(workerEnv.ttsMaxChunks);
      const targetLengthCandidates = preferredTargetLengthMinutes === 15 ? ([15, 5] as const) : ([5] as const);
      const summarySourceType =
        item.sourceType === "URL" ||
        item.sourceType === "PDF" ||
        item.sourceType === "HTML_SNAPSHOT"
          ? item.sourceType
          : "URL";
      let selectedSummary: DigestSummaryResponse | null = null;
      let selectedSummaryTargetLengthMinutes: 5 | 15 = preferredTargetLengthMinutes;
      let selectedSummaryBody = "";
      let selectedNarrationText = "";
      let selectedChunks: ReturnType<typeof chunkText> = [];
      let lastSummaryProviderError: unknown = null;

      for (const targetLengthMinutes of targetLengthCandidates) {
        let summary: DigestSummaryResponse;
        try {
          summary = await summaryProvider.summarize({
            kind: "item_summary",
            cadence: "DAILY",
            timezone: "UTC",
            periodKey: item.id,
            windowStart: claimResult.createdAt,
            windowEnd: now(),
            targetLengthMinutes,
            targetWords: digestTargetWords(targetLengthMinutes),
            requestedTitle: resolvedTitle,
            sources: [
              {
                itemId: item.id,
                title: resolvedTitle,
                sourceType: summarySourceType,
                sourceUrl: item.sourceUrl,
                createdAt: claimResult.createdAt,
                markdown: cleanedMarkdown
              }
            ]
          });
        } catch (error) {
          lastSummaryProviderError = error;
          await workerLogger.warn("Automatic long-source summary provider failed; trying bounded fallback", {
            itemId: item.id,
            targetLengthMinutes,
            error: formatDiagnostic(error)
          });
          appendExtractionLog(extractionLogs, "tts", "Automatic summary provider failed", {
            targetLengthMinutes,
            error: formatDiagnostic(error)
          });
          continue;
        }

        const summaryBody = (summary.plainText || markdownToNarrationText(summary.markdown)).trim();
        if (!hasNarratableText(summaryBody)) {
          throw new AppError(errorCodes.EXTRACTION_EMPTY, "The automatic summary was empty.", 502);
        }

        const summaryNarrationText = buildLongSourceSummaryNarration(summaryBody);
        const summaryChunks = chunkText(summaryNarrationText, workerEnv.ttsChunkMaxChars);
        selectedSummary = summary;
        selectedSummaryTargetLengthMinutes = targetLengthMinutes;
        selectedSummaryBody = summaryBody;
        selectedNarrationText = summaryNarrationText;
        selectedChunks = summaryChunks;

        if (!shouldSummarizeLongSource(summaryChunks.length, workerEnv.ttsMaxChunks)) {
          break;
        }

        appendExtractionLog(extractionLogs, "tts", "Generated summary still exceeds chunk limit", {
          targetLengthMinutes,
          chunkCount: summaryChunks.length,
          maxChunks: workerEnv.ttsMaxChunks
        });
      }

      if (!selectedSummary || selectedChunks.length === 0) {
        const fallback = buildDeterministicLongSourceSummary({
          title: resolvedTitle,
          sourceNarrationText: episodeNarrationText,
          maxChunks: workerEnv.ttsMaxChunks,
          chunkMaxChars: workerEnv.ttsChunkMaxChars
        });
        selectedSummary = fallback.summary;
        selectedSummaryTargetLengthMinutes = 5;
        selectedSummaryBody = fallback.summary.plainText;
        selectedNarrationText = fallback.narrationText;
        selectedChunks = fallback.chunks;
        await workerLogger.warn("Using deterministic bounded summary for long source", {
          itemId: item.id,
          originalChunkCount,
          summarizedChunkCount: selectedChunks.length,
          providerError: lastSummaryProviderError ? formatDiagnostic(lastSummaryProviderError) : null
        });
        appendExtractionLog(extractionLogs, "tts", "Using deterministic bounded summary", {
          originalChunkCount,
          summarizedChunkCount: selectedChunks.length,
          providerError: lastSummaryProviderError ? formatDiagnostic(lastSummaryProviderError) : null
        });
      }

      if (shouldSummarizeLongSource(selectedChunks.length, workerEnv.ttsMaxChunks)) {
        const fitted = fitLongSourceSummaryNarration({
          summaryBody: selectedSummaryBody,
          maxChunks: workerEnv.ttsMaxChunks,
          chunkMaxChars: workerEnv.ttsChunkMaxChars
        });
        selectedSummaryBody = fitted.summaryBody;
        selectedNarrationText = fitted.narrationText;
        selectedChunks = fitted.chunks;
        selectedSummary = {
          ...selectedSummary,
          markdown: buildPlainTextSummaryMarkdown(selectedSummary.title, selectedSummaryBody),
          plainText: selectedSummaryBody
        };
        await workerLogger.warn("Clamped generated long-source summary to fit audio chunk limit", {
          itemId: item.id,
          originalSummaryChunkCount: fitted.originalChunkCount,
          clampedChunkCount: selectedChunks.length,
          maxChunks: workerEnv.ttsMaxChunks
        });
        appendExtractionLog(extractionLogs, "tts", "Clamped generated summary to fit chunk limit", {
          originalSummaryChunkCount: fitted.originalChunkCount,
          clampedChunkCount: selectedChunks.length,
          maxChunks: workerEnv.ttsMaxChunks
        });
      }
      assertNarrationChunkLimit(selectedChunks.length, workerEnv.ttsMaxChunks);

      const summaryStorageKey = buildUserItemSummaryStorageKey(item.userId, item.id);
      const storedSummary = await getArtifactStorage().putObject(summaryStorageKey, Buffer.from(selectedSummary.markdown, "utf8"), {
        contentType: "text/markdown; charset=utf-8"
      });
      const summaryCompletedAt = now();
      automaticSummaryItemPatch = {
        summaryStatus: "SUCCEEDED",
        summaryTitle: selectedSummary.title,
        summaryStorageKey: storedSummary.key,
        summaryBytes: storedSummary.bytes,
        summaryProvider: selectedSummary.provider,
        summaryModel: selectedSummary.model,
        summaryDeployment: selectedSummary.deployment ?? null,
        summaryInputTokens: selectedSummary.inputTokens ?? null,
        summaryOutputTokens: selectedSummary.outputTokens ?? null,
        summaryErrorCode: null,
        summaryErrorMessage: null,
        summaryCompletedAt
      };
      episodeNarrationText = selectedNarrationText;
      chunks = selectedChunks;
      cacheKey = buildTtsCacheKey(item.userId, ttsSelection, chunks);
      cacheHit = await findChunkCacheByHash(cacheKey);
      appendExtractionLog(extractionLogs, "tts", "Summarized podcast narration prepared", {
        originalChunkCount,
        summarizedChunkCount: chunks.length,
        targetLengthMinutes: selectedSummaryTargetLengthMinutes,
        storageKey: storedSummary.key,
        bytes: storedSummary.bytes
      });
    }

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
      try {
        assertNarrationChunkLimit(chunks.length, workerEnv.ttsMaxChunks);
      } catch (error) {
        if (error instanceof AppError) {
          await workerLogger.warn("Narration exceeds configured audio chunk limit", {
            chunkCount: chunks.length,
            maxChunks: workerEnv.ttsMaxChunks,
            sourceType: item.sourceType
          });
          appendExtractionLog(extractionLogs, "tts", "Narration rejected before synthesis", {
            chunkCount: chunks.length,
            maxChunks: workerEnv.ttsMaxChunks
          });
        }
        throw error;
      }
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
        assertLeaseHealthy();
        if (Date.now() - lockedAtMs >= workerEnv.maxProcessingMs) {
          throw buildMaxProcessingTimeError();
        }
        const nowMs = Date.now();
        const shouldWrite = current === total || current === 1 || nowMs - lastProgressWriteAt >= 4000;
        if (!shouldWrite) {
          return;
        }
        lastProgressWriteAt = nowMs;
        const progressMessage =
          total <= 1 ? "Processing audio..." : `Processing audio chunk ${current}/${total}...`;
        await updateClaimProgressMessage(claimResult, progressMessage);
      });
      assertLeaseHealthy();
      if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
        await workerPrimaryStore.createChunkCache({
          id: generateStoreId(),
          itemId: item.id,
          chunkIndex: 0,
          hash: cacheKey,
          filePath: audio.relativePath,
          audioBytes: audio.bytes,
          mimeType: audio.mimeType
        });
      } else {
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
      appendExtractionLog(extractionLogs, "tts", "Narration synthesis complete", {
        outputPath: audio.relativePath,
        bytes: audio.bytes,
        mimeType: audio.mimeType
      });
    }

    const guid = `episode-${item.id}`;
    const description = buildEpisodeDescription(episodeNarrationText);
    const publishedAt = now();
    const expiresAt = episodeAudioExpiryDate(publishedAt, workerEnv.audioRetentionDays);

    stage = "persist";
    assertLeaseHealthy();
    await renewClaimLease(claimResult);
    assertLeaseHealthy();
    if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
      await workerPrimaryStore.upsertEpisode({
        id: generateStoreId(),
        itemId: item.id,
        userId: item.userId,
        guid,
        title: resolvedTitle,
        description,
        audioPath: audio.relativePath,
        audioBytes: audio.bytes,
        mimeType: audio.mimeType,
        publishedAt,
        expiresAt
      });
      await workerPrimaryStore.updateItem(item.id, {
        title: resolvedTitle,
        status: "READY",
        textHash: cacheKey,
        sourceHtml: item.sourceType === "HTML_SNAPSHOT" ? null : undefined,
        errorCode: null,
        errorMessage: null,
        ...(automaticSummaryItemPatch ?? {})
      });
      const completedJob = await workerPrimaryStore.updateJobIfLeaseMatches(claimResult.id, claimResult.leaseId ?? "", {
        status: "SUCCEEDED",
        errorCode: null,
        errorMessage: null,
        lockedAt: null,
        nextRetryAt: null,
        lastHeartbeatAt: publishedAt,
        clearLease: true
      });
      if (!completedJob) {
        throw new LostJobLeaseError();
      }
    } else {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const completedJob = await tx.job.updateMany({
          where: {
            id: claimResult.id,
            leaseId: claimResult.leaseId,
            status: "PROCESSING"
          },
          data: {
            status: "SUCCEEDED",
            lockedAt: null,
            leaseId: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastHeartbeatAt: publishedAt,
            nextRetryAt: null,
            errorCode: null,
            errorMessage: null
          }
        });
        if (completedJob.count !== 1) {
          throw new LostJobLeaseError();
        }

        await tx.episode.upsert({
          where: { itemId: item.id },
          update: {
            guid,
            title: resolvedTitle,
            description,
            audioPath: audio.relativePath,
            audioBytes: audio.bytes,
            mimeType: audio.mimeType,
            publishedAt,
            expiresAt
          },
          create: {
            itemId: item.id,
            guid,
            title: resolvedTitle,
            description,
            audioPath: audio.relativePath,
            audioBytes: audio.bytes,
            mimeType: audio.mimeType,
            publishedAt,
            expiresAt
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
            errorMessage: null,
            ...(automaticSummaryItemPatch ?? {})
          }
        });
      });
    }
    appendExtractionLog(extractionLogs, "persist", "Episode and item persisted", {
      guid,
      audioPath: audio.relativePath
    });
    await deleteDispatchMessage(claimResult);

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

    await syncJobAndItemProjectionByJobId(claimResult.id);

    return true;
      }
    );
  } catch (error) {
    if (error instanceof LostJobLeaseError) {
      await workerLogger.warn("Worker lost item lease before completion; skipping final state write", {
        jobId: claimResult.id,
        itemId: item.id,
        workerInstanceId: workerEnv.workerInstanceId,
        dispatchMessageId: claimResult.dispatchMessage?.messageId ?? claimResult.dispatchMessageId
      });
      if (claimResult.dispatchMessage) {
        await settleDispatchMessageForCurrentJobState(claimResult.dispatchMessage);
      }
      await syncJobAndItemProjectionByJobId(claimResult.id);
      return false;
    }

    const mappedError = mapUnexpectedWorkerError(error, stage);
    const err =
      stage === "extract" && shouldSuggestHtmlSnapshotForError(error)
        ? new AppError(mappedError.code, BLOCKED_SITE_HTML_SNAPSHOT_MESSAGE, mappedError.status)
        : mappedError;
    const diagnostic = formatDiagnostic(error);
    const retryRecommended =
      shouldRecommendRetry(err) && claimResult.attempt < workerEnv.maxRetryAttempts;
    const safeErrorMessage = toSafeErrorMessage(err.userMessage);
    const retryAt = retryRecommended ? buildRetryAt(Math.max(30_000, workerEnv.retryPollMs)) : null;
    const failedItemPatch = {
      status: "FAILED",
      errorCode: err.code,
      errorMessage: safeErrorMessage,
      ...(claimedJobKind === "SUMMARY_ONLY"
        ? {
            summaryStatus: "FAILED",
            summaryErrorCode: err.code,
            summaryErrorMessage: safeErrorMessage
          }
        : {})
    };
    const fallbackFailedItemPatch = {
      status: "FAILED",
      errorCode: err.code,
      errorMessage: "Processing failed. Please retry.",
      ...(claimedJobKind === "SUMMARY_ONLY"
        ? {
            summaryStatus: "FAILED",
            summaryErrorCode: err.code,
            summaryErrorMessage: "Processing failed. Please retry."
          }
        : {})
    };

    try {
      if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
        const failedJob = await workerPrimaryStore.updateJobIfLeaseMatches(claimResult.id, claimResult.leaseId ?? "", {
          status: "FAILED",
          errorCode: err.code,
          errorMessage: safeErrorMessage,
          nextRetryAt: retryAt,
          lockedAt: null,
          lastHeartbeatAt: now(),
          clearLease: true
        });
        if (!failedJob) {
          throw new LostJobLeaseError();
        }
        await workerPrimaryStore.updateItem(item.id, failedItemPatch);
      } else {
        const persisted = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const failedJob = await tx.job.updateMany({
            where: {
              id: claimResult.id,
              leaseId: claimResult.leaseId,
              status: "PROCESSING"
            },
            data: {
              status: "FAILED",
              lockedAt: null,
              leaseId: null,
              leaseOwner: null,
              leaseExpiresAt: null,
              lastHeartbeatAt: now(),
              errorCode: err.code,
              errorMessage: safeErrorMessage,
              nextRetryAt: retryAt
            }
          });
          if (failedJob.count !== 1) {
            return false;
          }

          await tx.item.update({
            where: { id: item.id },
            data: failedItemPatch
          });
          return true;
        });
        if (!persisted) {
          throw new LostJobLeaseError();
        }
      }
    } catch (stateError) {
      if (stateError instanceof LostJobLeaseError) {
        if (claimResult.dispatchMessage) {
          await settleDispatchMessageForCurrentJobState(claimResult.dispatchMessage);
        }
        await syncJobAndItemProjectionByJobId(claimResult.id);
        return false;
      }

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

      if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
        const failedJob = await workerPrimaryStore.updateJobIfLeaseMatches(claimResult.id, claimResult.leaseId ?? "", {
          status: "FAILED",
          errorCode: err.code,
          errorMessage: "Processing failed. Please retry.",
          nextRetryAt: retryAt,
          lockedAt: null,
          lastHeartbeatAt: now(),
          clearLease: true
        });
        if (failedJob) {
          await workerPrimaryStore.updateItem(item.id, fallbackFailedItemPatch);
        }
      } else {
        const failedJob = await prisma.job.updateMany({
          where: {
            id: claimResult.id,
            leaseId: claimResult.leaseId,
            status: "PROCESSING"
          },
          data: {
            status: "FAILED",
            lockedAt: null,
            leaseId: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastHeartbeatAt: now(),
            errorCode: err.code,
            errorMessage: "Processing failed. Please retry.",
            nextRetryAt: retryAt
          }
        });
        if (failedJob.count === 1) {
          await prisma.item.updateMany({
            where: { id: item.id },
            data: fallbackFailedItemPatch
          });
        }
      }
    }

    if (retryAt) {
      await releaseDispatchMessage(claimResult, retryAt);
    } else {
      await deleteDispatchMessage(claimResult);
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

    await syncItemProjectionById(item.id);
    await syncJobAndItemProjectionByJobId(claimResult.id);

    return false;
  } finally {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
  }
}

export async function processNextQueuedJob(): Promise<boolean> {
  const reconciled = await reconcileMissingItemDispatchMessages();
  if (reconciled > 0) {
    await workerLogger.info("Reconciled missing item dispatch messages", {
      reconciled,
      backend: dispatchQueue.backend
    });
  }

  for (let attempts = 0; attempts < 3; attempts += 1) {
    let reserved = await dispatchQueue.reserveNext({
      visibilityTimeoutMs: workerEnv.itemDispatchVisibilityMs,
      reservedBy: workerEnv.workerInstanceId
    });
    if (!reserved) {
      if (attempts > 0) {
        return false;
      }
      const forcedReconciled = await reconcileMissingItemDispatchMessages(true);
      if (forcedReconciled <= 0) {
        return false;
      }
      reserved = await dispatchQueue.reserveNext({
        visibilityTimeoutMs: workerEnv.itemDispatchVisibilityMs,
        reservedBy: workerEnv.workerInstanceId
      });
      if (!reserved) {
        return false;
      }
    }

    const staleHandled = await handleExpiredProcessingReservation(reserved);
    if (staleHandled === "continue") {
      continue;
    }

    if (reserved.dequeueCount > workerEnv.itemDispatchMaxDeliveries) {
      const terminalMessage = "Job exceeded the maximum dispatch delivery attempts and was stopped.";
      if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
        const currentJob = await workerPrimaryStore.findJobById(reserved.jobId);
        if (currentJob) {
          await workerPrimaryStore.updateJob(currentJob.id, {
            status: "FAILED",
            lockedAt: null,
            leaseId: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastHeartbeatAt: now(),
            nextRetryAt: null,
            errorCode: errorCodes.INTERNAL_ERROR,
            errorMessage: terminalMessage,
            dispatchMessageId: null
          });
          await workerPrimaryStore.updateItem(currentJob.itemId, {
            status: "FAILED",
            errorCode: errorCodes.INTERNAL_ERROR,
            errorMessage: terminalMessage
          });
        }
      } else {
        const currentJob = await prisma.job.findUnique({
          where: { id: reserved.jobId },
          select: { id: true, itemId: true }
        });
        if (currentJob) {
          await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.job.updateMany({
              where: { id: currentJob.id },
              data: {
                status: "FAILED",
                lockedAt: null,
                leaseId: null,
                leaseOwner: null,
                leaseExpiresAt: null,
                lastHeartbeatAt: now(),
                nextRetryAt: null,
                errorCode: errorCodes.INTERNAL_ERROR,
                errorMessage: terminalMessage,
                dispatchMessageId: null
              }
            });
            await tx.item.updateMany({
              where: { id: currentJob.itemId },
              data: {
                status: "FAILED",
                errorCode: errorCodes.INTERNAL_ERROR,
                errorMessage: terminalMessage
              }
            });
          });
        }
      }
      await dispatchQueue.delete({
        messageId: reserved.messageId,
        receipt: reserved.receipt
      });
      await workerLogger.errorWithCode({
        msg: "Dead-lettered item dispatch message after repeated delivery",
        error_code: errorCodes.INTERNAL_ERROR,
        attrs: {
          jobId: reserved.jobId,
          messageId: reserved.messageId,
          dequeueCount: reserved.dequeueCount,
          maxDeliveries: workerEnv.itemDispatchMaxDeliveries
        }
      });
      return false;
    }

    return processJob(reserved.jobId, reserved);
  }

  return false;
}
