import { verifyMediaUrl } from "@articlepod/core";
import { env } from "./env";

/** Canonical MIME types for media artifacts */
export const MIME_AUDIO_MPEG = "audio/mpeg" as const;
export const MIME_AUDIO_MP4 = "audio/mp4" as const;
export const MIME_APPLICATION_PDF = "application/pdf" as const;

export function contentTypeForPath(path: string): string {
  if (path.endsWith(".mp3")) {
    return MIME_AUDIO_MPEG;
  }
  if (path.endsWith(".pdf")) {
    return MIME_APPLICATION_PDF;
  }
  return MIME_AUDIO_MP4;
}

export function validateLegacyMediaToken(path: string, token: string | null): boolean {
  if (!token) {
    return false;
  }
  if (!env.mediaSigningKey) {
    return token.length > 0;
  }
  const result = verifyMediaUrl(path, token, env.mediaSigningKey);
  return result.valid;
}

export function parseRangeHeader(range: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    return null;
  }

  const startPart = match[1];
  const endPart = match[2];

  if (!startPart && !endPart) {
    return null;
  }

  if (!startPart) {
    const suffixLength = Number(endPart);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }
    const start = suffixLength >= size ? 0 : size - suffixLength;
    return { start, end: size - 1 };
  }

  const start = Number(startPart);
  const end = endPart ? Number(endPart) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
}
