import { enforceRateLimit } from "@listenlater/core";

export function enforceSubmitRateLimits(userId: string, ip: string): void {
  enforceRateLimit(`submit:user:${userId}`, 20, 60_000);
  enforceRateLimit(`submit:ip:${ip}`, 60, 60_000);
}
