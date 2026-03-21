import assert from "node:assert/strict";
import test from "node:test";
import { signMediaUrl, verifyMediaUrl } from "../src/security/signedUrl";

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
