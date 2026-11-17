import { errorCodes } from "../errors/codes";

const TECHNICAL_SUMMARY_PATTERNS = [
  /\bazure\b/i,
  /\bopenai\b/i,
  /\bdeployment\b/i,
  /\bmodel\b/i,
  /\breturned\s+\d{3}\b/i,
  /\brequest failed\b/i,
  /\bstatus code\b/i,
  /\binvalid json\b/i,
  /\bjson schema\b/i,
  /\bstructured content\b/i,
  /\bchoices\b/i,
  /\btimed out\b/i,
  /\bresponse\b/i
];

const TECHNICAL_PODCAST_PATTERNS = [
  ...TECHNICAL_SUMMARY_PATTERNS,
  /\btts\b/i,
  /\bffmpeg\b/i,
  /\bspeech synthesis\b/i,
  /\baudio generation\b/i,
  /\bvoice\b/i
];

function normalizeMessage(message: string | null | undefined): string {
  return typeof message === "string" ? message.trim() : "";
}

function matchesAnyPattern(message: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

function defaultSummaryRunMessage(errorCode: string | null | undefined): string {
  switch (errorCode) {
    case errorCodes.INVALID_INPUT:
      return "These selected articles are no longer ready to summarize. Refresh the list and try again.";
    case errorCodes.EXTRACTION_EMPTY:
      return "We couldn't build a useful summary from these articles. Try a different selection and run it again.";
    case errorCodes.PDF_OCR_NOT_SUPPORTED:
      return "One of the selected files needs OCR before it can be summarized.";
    case errorCodes.RATE_LIMITED:
      return "Summary processing is busy right now. Please try again in a moment.";
    case errorCodes.PROCESSING_TIMEOUT:
      return "This summary is taking longer than expected. Please try again.";
    case errorCodes.STORAGE_FAILED:
      return "We couldn't save this summary right now. Please try again.";
    case errorCodes.UNAUTHORIZED:
      return "Please sign in again and retry this summary.";
    case errorCodes.EXTRACTION_FAILED:
    case errorCodes.INTERNAL_ERROR:
    default:
      return "We couldn't finish this summary right now. Please try again.";
  }
}

export function toSummaryRunUserMessage(
  message: string | null | undefined,
  errorCode?: string | null
): string | null {
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return errorCode ? defaultSummaryRunMessage(errorCode) : null;
  }

  if (
    errorCode === errorCodes.INVALID_INPUT ||
    errorCode === errorCodes.EXTRACTION_EMPTY ||
    errorCode === errorCodes.PDF_OCR_NOT_SUPPORTED ||
    errorCode === errorCodes.RATE_LIMITED ||
    errorCode === errorCodes.PROCESSING_TIMEOUT ||
    errorCode === errorCodes.STORAGE_FAILED ||
    errorCode === errorCodes.UNAUTHORIZED ||
    errorCode === errorCodes.EXTRACTION_FAILED ||
    errorCode === errorCodes.INTERNAL_ERROR
  ) {
    return defaultSummaryRunMessage(errorCode);
  }

  if (matchesAnyPattern(normalized, TECHNICAL_SUMMARY_PATTERNS)) {
    return defaultSummaryRunMessage(errorCode);
  }

  return normalized;
}

export function toSummaryPodcastUserMessage(message: string | null | undefined): string | null {
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return null;
  }

  if (
    normalized.toLowerCase().includes("summary markdown is empty") ||
    matchesAnyPattern(normalized, TECHNICAL_PODCAST_PATTERNS)
  ) {
    return "The summary is ready, but we couldn't publish the audio version. Please try again.";
  }

  return normalized;
}
