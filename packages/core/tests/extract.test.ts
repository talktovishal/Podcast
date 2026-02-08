import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractHtmlFromUrl } from "../src/extract/html";
import { extractTextFromPdf } from "../src/extract/pdf";
import { AppError, errorCodes } from "../src/errors/codes";

test("extractHtmlFromUrl extracts fixture", async () => {
  const html = await readFile(new URL("../../../fixtures/html/article.html", import.meta.url), "utf-8");
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      text: async () => html
    }) as unknown as Response) as typeof fetch;

  const result = await extractHtmlFromUrl("https://example.com/article");
  assert.ok(result.text.length > 100);
  assert.ok(result.title.includes("Fixture"));

  globalThis.fetch = originalFetch;
});

test("extractHtmlFromUrl applies postcast cleaner pipeline", async () => {
  const noisyHtml = `
    <html>
      <head><title>Cleaner Fixture</title></head>
      <body>
        <article>
          <h1>Cleaner Fixture</h1>
          <p>This article has enough text to pass extraction minimums and stay deterministic for tests.</p>
          <p>Read more at https://example.com/deep/link and continue reading for context and details.</p>
          <p>Subscribe to our newsletter for updates.</p>
          <p>This final paragraph adds more stable words so the extracted output remains over minimum length.</p>
        </article>
      </body>
    </html>
  `;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      text: async () => noisyHtml
    }) as unknown as Response) as typeof fetch;

  const result = await extractHtmlFromUrl("https://example.com/cleaner");
  assert.equal(result.title, "Cleaner Fixture");
  assert.ok(result.text.includes("Link in description."));
  assert.ok(!result.text.toLowerCase().includes("subscribe to our newsletter"));

  globalThis.fetch = originalFetch;
});

test("extractHtmlFromUrl maps 403 to actionable extraction error", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 403,
      text: async () => ""
    }) as unknown as Response) as typeof fetch;

  await assert.rejects(
    () => extractHtmlFromUrl("https://example.com/blocked"),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === errorCodes.EXTRACTION_FAILED &&
      error.userMessage.toLowerCase().includes("blocked access")
  );

  globalThis.fetch = originalFetch;
});

test("extractHtmlFromUrl maps network timeout to actionable extraction error", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    const err = new Error("fetch failed");
    (err as Error & { cause?: { code?: string } }).cause = { code: "UND_ERR_HEADERS_TIMEOUT" };
    throw err;
  }) as typeof fetch;

  await assert.rejects(
    () => extractHtmlFromUrl("https://example.com/timeout"),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === errorCodes.EXTRACTION_FAILED &&
      error.userMessage.toLowerCase().includes("timed out")
  );

  globalThis.fetch = originalFetch;
});

test("extractTextFromPdf extracts text fixture", async () => {
  const data = await readFile(new URL("../../../fixtures/pdf/text-based.pdf", import.meta.url));
  const result = await extractTextFromPdf(new Uint8Array(data));
  assert.ok(result.pages >= 1);
  assert.ok(result.text.toLowerCase().includes("listenlater fixture"));
  assert.ok(result.title === null || typeof result.title === "string");
});

test("extractTextFromPdf fails scanned-style fixture", async () => {
  const data = await readFile(new URL("../../../fixtures/pdf/scanned-like.pdf", import.meta.url));
  await assert.rejects(() => extractTextFromPdf(new Uint8Array(data)));
});
