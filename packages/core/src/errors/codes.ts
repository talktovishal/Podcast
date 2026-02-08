export const errorCodes = {
  INVALID_INPUT: "INVALID_INPUT",
  URL_BLOCKED: "URL_BLOCKED",
  RATE_LIMITED: "RATE_LIMITED",
  EXTRACTION_EMPTY: "EXTRACTION_EMPTY",
  PDF_OCR_NOT_SUPPORTED: "PDF_OCR_NOT_SUPPORTED",
  EXTRACTION_FAILED: "EXTRACTION_FAILED",
  TTS_FAILED: "TTS_FAILED",
  STORAGE_FAILED: "STORAGE_FAILED",
  MEDIA_NOT_FOUND: "MEDIA_NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  INTERNAL_ERROR: "INTERNAL_ERROR"
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly userMessage: string;

  constructor(code: ErrorCode, userMessage: string, status = 400) {
    super(userMessage);
    this.code = code;
    this.status = status;
    this.userMessage = userMessage;
  }
}
