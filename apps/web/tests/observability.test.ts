import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { fromError } from "../src/lib/http";

test("fromError returns support_id for unexpected errors", async () => {
  const response = await fromError(new Error("kaboom"), { requestId: "req-obs-1", route: "/api/test" });
  assert.equal(response.status, 500);
  const body = (await response.json()) as { support_id?: string; error_code?: string };
  assert.equal(body.error_code, "INTERNAL_ERROR");
  assert.ok(body.support_id);
});

test("fromError maps zod errors to INVALID_INPUT", async () => {
  const schema = z.object({ count: z.number().int() });
  const result = schema.safeParse({ count: "oops" });
  assert.equal(result.success, false);
  if (result.success) {
    throw new Error("unexpected parse success");
  }
  const response = await fromError(result.error, { requestId: "req-obs-2", route: "/api/test" });
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error_code?: string; retry_recommended?: boolean };
  assert.equal(body.error_code, "INVALID_INPUT");
  assert.equal(body.retry_recommended, false);
});
