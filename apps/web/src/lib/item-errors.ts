const CHROME_EXTENSION_CAPTURE_HINT = "capture it with the chrome extension";
const PROVIDER_FAILURE_PATTERNS = [/python\s+\w+\s+provider failed/i, /\bkokoro\b/i, /\bpython-tts\b/i];
const GENERIC_AUDIO_FAILURE_MESSAGE = "Audio processing failed. Please retry.";

export function recommendsChromeExtensionCapture(errorMessage?: string | null): boolean {
  return (errorMessage || "").toLowerCase().includes(CHROME_EXTENSION_CAPTURE_HINT);
}

export function normalizeItemErrorMessage(errorMessage?: string | null): string | null {
  const trimmed = errorMessage?.trim();
  if (!trimmed) {
    return null;
  }

  if (PROVIDER_FAILURE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return GENERIC_AUDIO_FAILURE_MESSAGE;
  }

  return trimmed;
}
