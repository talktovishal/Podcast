import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNED_URL_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const STABLE_MEDIA_TOKEN_PREFIX = "v2";

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

function stableMediaPayload(path: string, scopeKey: string, resourceId: string): string {
  return `${scopeKey}:${resourceId}:${path}`;
}

export function signStableMediaUrl(path: string, signingKey: string, scopeKey: string, resourceId: string): string {
  const payload = stableMediaPayload(path, scopeKey, resourceId);
  const hmac = createHmac("sha256", signingKey).update(payload).digest("base64url");
  return `${STABLE_MEDIA_TOKEN_PREFIX}.${hmac}`;
}

export function verifyStableMediaUrl(
  path: string,
  token: string,
  signingKey: string,
  scopeKey: string,
  resourceId: string
): VerifyMediaUrlResult {
  const [version, providedHmac, ...extraParts] = token.split(".");
  if (version !== STABLE_MEDIA_TOKEN_PREFIX || !providedHmac || extraParts.length > 0) {
    return { valid: false, reason: "malformed_token" };
  }

  const payload = stableMediaPayload(path, scopeKey, resourceId);
  const expectedHmac = createHmac("sha256", signingKey).update(payload).digest("base64url");
  const expected = Buffer.from(expectedHmac, "utf8");
  const provided = Buffer.from(providedHmac, "utf8");

  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { valid: false, reason: "invalid_signature" };
  }

  return { valid: true };
}

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
