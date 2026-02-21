import test from "node:test";
import assert from "node:assert/strict";
import { validateFetchableUrl } from "../src/security/urlPolicy";

test("validateFetchableUrl blocks localhost", async () => {
  await assert.rejects(() => validateFetchableUrl("http://localhost:3000"));
});

test("validateFetchableUrl blocks unsupported protocol", async () => {
  await assert.rejects(() => validateFetchableUrl("file:///etc/passwd"));
});

test("validateFetchableUrl blocks metadata endpoint IP", async () => {
  await assert.rejects(() => validateFetchableUrl("http://169.254.169.254/metadata"));
});

test("validateFetchableUrl blocks private RFC-1918 IP", async () => {
  await assert.rejects(() => validateFetchableUrl("http://192.168.1.1/"));
});

test("validateFetchableUrl blocks loopback IP", async () => {
  await assert.rejects(() => validateFetchableUrl("http://127.0.0.1:8080/"));
});
