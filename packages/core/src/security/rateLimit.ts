import { AppError, errorCodes } from "../errors/codes.js";

export type RateLimitKey = string;

type Entry = { count: number; resetAt: number };

const buckets = new Map<RateLimitKey, Entry>();

export function enforceRateLimit(key: RateLimitKey, max: number, windowMs: number): void {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (current.count >= max) {
    throw new AppError(
      errorCodes.RATE_LIMITED,
      "Too many requests. Please wait a moment before trying again.",
      429
    );
  }

  current.count += 1;
}
