import { AppError, enforceRateLimit, errorCodes } from "@articlepod/core";
import { type NextRequest } from "next/server";
import { env } from "./env";
import { prisma } from "./prisma";

/**
 * Enforce a rate limit using a Postgres-backed counter when the runtime profile
 * is not "simple". For the simple (SQLite) profile, falls back to the in-memory
 * implementation in @articlepod/core which does not survive process restarts but
 * is sufficient for local development.
 */
async function enforceRateLimitAsync(key: string, max: number, windowMs: number): Promise<void> {
  if (env.runtimeProfile === "simple") {
    // In-memory (dev/local) path — synchronous, no DB needed.
    enforceRateLimit(key, max, windowMs);
    return;
  }

  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  // Atomic upsert: increment count or start fresh if the window has expired.
  const result = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" (key, count, "resetAt", "updatedAt")
    VALUES (${key}, 1, ${resetAt}, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count     = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1
                       ELSE "RateLimitBucket".count + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${resetAt}
                       ELSE "RateLimitBucket"."resetAt" END,
      "updatedAt" = ${now}
    RETURNING count
  `;

  const count = result[0]?.count ?? 1;
  if (count > max) {
    throw new AppError(
      errorCodes.RATE_LIMITED,
      "Too many requests. Please wait a moment before trying again.",
      429
    );
  }
}

export async function enforceSubmitRateLimits(userId: string, ip: string): Promise<void> {
  await enforceRateLimitAsync(`submit:user:${userId}`, 20, 60_000);
  await enforceRateLimitAsync(`submit:ip:${ip}`, 60, 60_000);
}

export async function enforceFeedbackRateLimits(userId: string, ip: string): Promise<void> {
  await enforceRateLimitAsync(`feedback:user:${userId}`, 10, 60_000);
  await enforceRateLimitAsync(`feedback:ip:${ip}`, 30, 60_000);
}

export async function enforceLoginRateLimits(ip: string): Promise<void> {
  await enforceRateLimitAsync(`login:ip:${ip}`, 10, 60_000);
}

/**
 * Extract the real client IP from a request.
 * Prefers X-Real-IP (set by nginx to $remote_addr, unforgeable by clients).
 * Falls back to the rightmost IP in X-Forwarded-For, which is the one appended
 * by the trusted proxy and cannot be forged by clients (unlike the leftmost).
 */
export function getClientIp(request: NextRequest): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const rightmost = xff.split(",").pop()?.trim();
    if (rightmost) return rightmost;
  }
  return "unknown";
}
