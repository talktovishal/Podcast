import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNED_URL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate an HMAC-signed media URL token.
 *
 * Token format (URL-safe base64): `<expiresEpochMs>.<hmac>`
 * HMAC input: `<path>:<expiresEpochMs>`
 */
export function signMediaUrl(path: string, signingKey: string, ttlMs = SIGNED_URL_TTL_MS): string {
  const expires = Date.now() + ttlMs;
  const payload = `${path}:${expires}`;
  const hmac = createHmac("sha256", signingKey).update(payload).digest("base64url");
  return `${expires}.${hmac}`;
}

export type VerifyMediaUrlResult = { valid: true } | { valid: false; reason: string };

/**
 * Verify an HMAC-signed media URL token.
 */
export function verifyMediaUrl(path: string, token: string, signingKey: string): VerifyMediaUrlResult {
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) {
    return { valid: false, reason: "malformed_token" };
  }

  const expiresPart = token.slice(0, dotIndex);
  const providedHmac = token.slice(dotIndex + 1);

  const expires = Number(expiresPart);
  if (!Number.isFinite(expires) || expires <= 0) {
    return { valid: false, reason: "malformed_token" };
  }

  if (Date.now() > expires) {
    return { valid: false, reason: "token_expired" };
  }

  const payload = `${path}:${expires}`;
  const expectedHmac = createHmac("sha256", signingKey).update(payload).digest("base64url");

  // Constant-time comparison
  const expected = Buffer.from(expectedHmac, "utf8");
  const provided = Buffer.from(providedHmac, "utf8");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { valid: false, reason: "invalid_signature" };
  }

  return { valid: true };
}
