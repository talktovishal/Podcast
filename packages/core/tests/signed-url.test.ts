import assert from "node:assert/strict";
import test from "node:test";
import { signMediaUrl, signStableMediaUrl, verifyMediaUrl, verifyStableMediaUrl } from "../src/security/signedUrl";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

test("signMediaUrl defaults to a 14-day expiry window", () => {
  const path = "items/example/episode.mp3";
  const signingKey = "test-signing-key";
  const before = Date.now();
  const token = signMediaUrl(path, signingKey);
  const after = Date.now();

  const [expiresPart] = token.split(".", 1);
  const expiresAt = Number(expiresPart);

  assert.ok(Number.isFinite(expiresAt));
  assert.ok(expiresAt >= before + FOURTEEN_DAYS_MS);
  assert.ok(expiresAt <= after + FOURTEEN_DAYS_MS);
  assert.deepEqual(verifyMediaUrl(path, token, signingKey), { valid: true });
});

test("verifyMediaUrl rejects tokens once they expire", async () => {
  const token = signMediaUrl("items/example/episode.mp3", "test-signing-key", 5);

  await new Promise((resolve) => setTimeout(resolve, 15));

  assert.deepEqual(verifyMediaUrl("items/example/episode.mp3", token, "test-signing-key"), {
    valid: false,
    reason: "token_expired"
  });
});

test("signStableMediaUrl stays deterministic for the same scope", () => {
  const token = signStableMediaUrl("items/example/episode.mp3", "test-signing-key", "feed-hash-1", "episode-1");

  assert.equal(token, signStableMediaUrl("items/example/episode.mp3", "test-signing-key", "feed-hash-1", "episode-1"));
  assert.deepEqual(verifyStableMediaUrl("items/example/episode.mp3", token, "test-signing-key", "feed-hash-1", "episode-1"), {
    valid: true
  });
});

test("verifyStableMediaUrl rejects tokens after feed rotation or scope mismatch", () => {
  const token = signStableMediaUrl("items/example/episode.mp3", "test-signing-key", "feed-hash-1", "episode-1");

  assert.deepEqual(verifyStableMediaUrl("items/example/episode.mp3", token, "test-signing-key", "feed-hash-2", "episode-1"), {
    valid: false,
    reason: "invalid_signature"
  });
  assert.deepEqual(verifyStableMediaUrl("items/example/episode.mp3", token, "test-signing-key", "feed-hash-1", "episode-2"), {
    valid: false,
    reason: "invalid_signature"
  });
  assert.deepEqual(verifyStableMediaUrl("items/example/other.mp3", token, "test-signing-key", "feed-hash-1", "episode-1"), {
    valid: false,
    reason: "invalid_signature"
  });
});
