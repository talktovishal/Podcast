import assert from "node:assert/strict";
import test from "node:test";
import { AppError, errorCodes } from "@articlepod/core";
import { fromError } from "../src/lib/http";
import { logger } from "../src/lib/logger";

for (const [code, status, retry] of [
  [errorCodes.ITEM_UPDATE_CONFLICT, 409, true],
  [errorCodes.ITEM_NOT_FOUND, 404, false]
] as const) {
  test(`item mutation failures produce logged non-success HTTP responses (${code})`, async (t) => {
    const log = t.mock.method(logger, "error", async () => "test-support-id");
    const response = await fromError(new AppError(code, "Item mutation failed.", status), {
      route: "/api/items/[id]"
    });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), {
      ok: false, error_code: code, error_message: "Item mutation failed.",
      retry_recommended: retry, support_id: "test-support-id"
    });
    assert.equal(log.mock.callCount(), 1);
  });
}
