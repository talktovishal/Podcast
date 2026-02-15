import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStructuredLogger, redactAttributes, withLogContext } from "../src/index";

test("redactAttributes redacts secrets", () => {
  const redacted = redactAttributes({
    authorization: "Bearer abcdefghijkl",
    nested: { feed_token: "token-value" },
    url: "https://example.com/media.mp3?token=abc&x=1",
  });
  assert.equal(redacted?.authorization, "[REDACTED]");
  assert.deepEqual(redacted?.nested, { feed_token: "[REDACTED]" });
  assert.equal(redacted?.url, "[REDACTED]");
});

test("structured logger writes support_id for error logs", async () => {
  const root = await mkdtemp(join(tmpdir(), "articlepod-log-test-"));
  const logger = createStructuredLogger({
    service: "core-test",
    env: "test",
    logRoot: root,
    maxBytes: 1024 * 1024,
    maxFiles: 5,
    retentionDays: 14,
  });

  const supportId = await withLogContext({ request_id: "req-123", item_id: "item-1" }, () =>
    logger.errorWithCode({ msg: "Boom", error_code: "INTERNAL_ERROR", attrs: { foo: "bar" } })
  );

  const file = join(root, "core-test", "app.log.jsonl");
  const content = await readFile(file, "utf8");
  const lines = content.trim().split("\n");
  assert.equal(lines.length, 1);
  const event = JSON.parse(lines[0]);
  assert.equal(event.error_code, "INTERNAL_ERROR");
  assert.equal(event.request_id, "req-123");
  assert.equal(event.item_id, "item-1");
  assert.equal(event.support_id, supportId);

  await rm(root, { recursive: true, force: true });
});
