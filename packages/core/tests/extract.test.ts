import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractHtmlFromUrl } from "../src/extract/html.js";
import { extractTextFromPdf } from "../src/extract/pdf.js";

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

test("extractTextFromPdf extracts text fixture", async () => {
  const data = await readFile(new URL("../../../fixtures/pdf/text-based.pdf", import.meta.url));
  const result = await extractTextFromPdf(new Uint8Array(data));
  assert.ok(result.pages >= 1);
  assert.ok(result.text.toLowerCase().includes("listenlater fixture"));
});

test("extractTextFromPdf fails scanned-style fixture", async () => {
  const data = await readFile(new URL("../../../fixtures/pdf/scanned-like.pdf", import.meta.url));
  await assert.rejects(() => extractTextFromPdf(new Uint8Array(data)));
});
