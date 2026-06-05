import { AppError, chunkText, errorCodes, type TextChunk } from "@articlepod/core";

export const DEFAULT_TTS_MAX_CHUNKS = 24;
export const LONG_SOURCE_SUMMARY_NOTICE =
  "This is a summarized transcript because the original source was too long to fit into one podcast episode.";

type FittedLongSourceSummaryNarration = {
  summaryBody: string;
  narrationText: string;
  chunks: TextChunk[];
  wasClamped: boolean;
  originalChunkCount: number;
};

export function shouldSummarizeLongSource(chunkCount: number, maxChunks: number): boolean {
  return chunkCount > maxChunks;
}

export function automaticSummaryTargetLengthMinutes(maxChunks: number): 5 | 15 {
  return maxChunks >= 12 ? 15 : 5;
}

export function buildLongSourceSummaryNarration(summaryBody: string): string {
  return [LONG_SOURCE_SUMMARY_NOTICE, summaryBody.trim()].filter(Boolean).join("\n\n");
}

function normalizeBodyForClamp(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function trimAtNaturalBoundary(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input.trim();
  }

  const clipped = input.slice(0, Math.max(0, maxChars)).trim();
  const boundaryFloor = Math.floor(maxChars * 0.6);
  const boundaries = [". ", "! ", "? ", "; ", ": ", ", "]
    .map((boundary) => {
      const index = clipped.lastIndexOf(boundary);
      return index >= 0 ? index + boundary.trimEnd().length : -1;
    })
    .filter((index) => index >= boundaryFloor);

  const boundary = boundaries.length > 0 ? Math.max(...boundaries) : -1;
  const trimmed = boundary > 0 ? clipped.slice(0, boundary) : clipped;
  return trimmed.replace(/[\s,;:.-]+$/g, "").trim();
}

export function fitLongSourceSummaryNarration(input: {
  summaryBody: string;
  maxChunks: number;
  chunkMaxChars: number;
}): FittedLongSourceSummaryNarration {
  const originalNarrationText = buildLongSourceSummaryNarration(input.summaryBody);
  const originalChunks = chunkText(originalNarrationText, input.chunkMaxChars);
  if (originalChunks.length <= input.maxChunks) {
    return {
      summaryBody: input.summaryBody.trim(),
      narrationText: originalNarrationText,
      chunks: originalChunks,
      wasClamped: false,
      originalChunkCount: originalChunks.length
    };
  }

  const normalizedBody = normalizeBodyForClamp(input.summaryBody);
  const noticeOverhead = LONG_SOURCE_SUMMARY_NOTICE.length + 2;
  let budget = Math.max(1, input.maxChunks * input.chunkMaxChars - noticeOverhead);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const summaryBody = trimAtNaturalBoundary(normalizedBody, budget);
    const narrationText = buildLongSourceSummaryNarration(summaryBody);
    const chunks = chunkText(narrationText, input.chunkMaxChars);
    if (chunks.length <= input.maxChunks) {
      return {
        summaryBody,
        narrationText,
        chunks,
        wasClamped: true,
        originalChunkCount: originalChunks.length
      };
    }

    budget = Math.max(1, Math.floor(budget * 0.75));
  }

  const narrationText = LONG_SOURCE_SUMMARY_NOTICE;
  return {
    summaryBody: "",
    narrationText,
    chunks: chunkText(narrationText, input.chunkMaxChars),
    wasClamped: true,
    originalChunkCount: originalChunks.length
  };
}

export function buildSourceTooLongError(chunkCount: number, maxChunks: number): AppError {
  return new AppError(
    errorCodes.SOURCE_TOO_LONG,
    `This source is too long to narrate as one episode (${chunkCount} audio chunks; limit ${maxChunks}). Split it into smaller sources or sections and try again.`,
    400
  );
}

export function assertNarrationChunkLimit(chunkCount: number, maxChunks: number): void {
  if (chunkCount > maxChunks) {
    throw buildSourceTooLongError(chunkCount, maxChunks);
  }
}
