import { AppError, errorCodes } from "@articlepod/core";

export const DEFAULT_TTS_MAX_CHUNKS = 24;

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
