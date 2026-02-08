import test from "node:test";
import assert from "node:assert/strict";
import { validateFetchableUrl } from "../src/security/urlPolicy.js";

test("validateFetchableUrl blocks localhost", async () => {
  await assert.rejects(() => validateFetchableUrl("http://localhost:3000"));
});

test("validateFetchableUrl blocks unsupported protocol", async () => {
  await assert.rejects(() => validateFetchableUrl("file:///etc/passwd"));
});
