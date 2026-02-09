const REDACT_KEYS = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "feed_token",
  "media_token",
  "extension_token",
  "token",
  "password",
  "secret"
];

function shouldRedactKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return REDACT_KEYS.some((sensitive) => normalized.includes(sensitive));
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      next[key] = shouldRedactKey(key) ? "[REDACTED]" : redactValue(entry);
    }
    return next;
  }

  if (typeof value === "string" && value.length > 8) {
    const lower = value.toLowerCase();
    if (lower.includes("bearer ") || lower.includes("token=") || lower.includes("authorization:")) {
      return "[REDACTED]";
    }

    try {
      const maybeUrl = new URL(value);
      for (const key of maybeUrl.searchParams.keys()) {
        if (shouldRedactKey(key)) {
          maybeUrl.searchParams.set(key, "[REDACTED]");
        }
      }
      return maybeUrl.toString();
    } catch {
      // not a URL-like value
    }
  }

  return value;
}

export function redactAttributes(attrs?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!attrs) {
    return undefined;
  }
  return redactValue(attrs) as Record<string, unknown>;
}
