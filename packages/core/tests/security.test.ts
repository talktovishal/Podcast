import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeFetchableUrl, validateFetchableUrl } from "../src/security/urlPolicy";

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

test("canonicalizeFetchableUrl follows safe redirect targets", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string | undefined }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof URL ? input.toString() : typeof input === "string" ? input : input.url;
    requests.push({ url, method: init?.method });
    if (url === "http://198.51.100.9/start") {
      return new Response(null, {
        status: 302,
        headers: { location: "https://203.0.113.7/final" }
      });
    }
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  try {
    const canonical = await canonicalizeFetchableUrl("http://198.51.100.9/start");
    assert.equal(canonical.canonicalUrl, "https://203.0.113.7/final");
    assert.equal(canonical.redirected, true);
    assert.equal(canonical.redirectCount, 1);
    assert.deepEqual(requests, [{ url: "http://198.51.100.9/start", method: "HEAD" }, { url: "https://203.0.113.7/final", method: "HEAD" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("canonicalizeFetchableUrl falls back to original URL when redirect discovery fails", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    throw new Error("network failed");
  }) as typeof fetch;

  try {
    const canonical = await canonicalizeFetchableUrl("https://203.0.113.7/article");
    assert.equal(canonical.canonicalUrl, "https://203.0.113.7/article");
    assert.equal(canonical.redirected, false);
    assert.equal(canonical.redirectCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("canonicalizeFetchableUrl rejects redirects to blocked hosts", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/internal" }
    })) as typeof fetch;

  try {
    await assert.rejects(
      () => canonicalizeFetchableUrl("http://198.51.100.9/start"),
      (error: unknown) => error instanceof Error && "code" in error && (error as { code?: string }).code === "URL_BLOCKED"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
