import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AppError, errorCodes, extractHtmlSnapshot } from "@articlepod/core";
import { prepareArticleSource } from "../src/lib/prepare-article-source.js";

const html = `<html><head><title>Source preparation</title></head><body><article>
<h1>Source preparation</h1><p>This article contains enough useful text to exercise the existing extraction
adapters without making network requests. Preparing text must not claim work or publish an episode.
The same captured source should produce the same result whether it comes from inline HTML, an object
store, or a legacy local upload. Its raw bytes and extraction diagnostics remain available to the caller.</p>
</article></body></html>`;
const source = { id: "preparation", sourceType: "HTML_SNAPSHOT", sourceUrl: "https://example.com/article",
  sourceHtml: html, sourceFilePath: null };

test("source preparation preserves inline, object-store and legacy snapshot results without writing", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-20T00:00:00Z") });
  const directory = await mkdtemp(join(tmpdir(), "articlepod-source-"));
  const file = join(directory, "source.html");
  await writeFile(file, `\n ${html} \n`);
  const extracted = extractHtmlSnapshot({ html, url: source.sourceUrl });
  try {
    for (const location of ["inline", "object", "legacy"] as const) {
      const reads: string[] = [];
      const logs: string[] = [];
      const result = await prepareArticleSource({
        ...source,
        sourceHtml: location === "inline" ? `\n ${html} \n` : null,
        sourceFilePath: location === "legacy" ? file : "captures/source.html"
      }, {
        readObject: async (key) => { reads.push(key); return Buffer.from(`\n ${html} \n`); },
        storageBackend: "local",
        rawArtifactRetentionDays: 3,
        log: (_stage, message) => { logs.push(message); }
      });
      assert.deepEqual(reads, location === "object" ? ["captures/source.html"] : []);
      assert.deepEqual(result, {
        title: extracted.title ?? "", text: extracted.text, markdown: extracted.markdown,
        sourceLabel: source.sourceUrl,
        sourceArtifact: {
          kind: "RAW_HTML", storageKey: "items/preparation/artifacts/source.html",
          contentType: "text/html; charset=utf-8", bytes: Buffer.from(extracted.rawHtml),
          expiresAt: new Date("2026-11-23T00:00:00Z")
        },
        selectionDiagnostics: extracted.selectionDiagnostics
      });
      assert.deepEqual(logs, ["Parsing captured HTML snapshot", "Snapshot extraction complete"]);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("source preparation preserves validation errors and blocks private URLs before source reads", async () => {
  const context: Parameters<typeof prepareArticleSource>[1] = {
    readObject: async () => { throw new Error("Unexpected source read"); },
    storageBackend: "local", rawArtifactRetentionDays: 3, log: () => {}
  };
  for (const [sourceType, message] of [
    ["URL", "Missing source URL"], ["HTML_SNAPSHOT", "Missing captured HTML snapshot"],
    ["PDF", "Missing source PDF path"], ["UNKNOWN", "Unsupported item source type"]
  ]) {
    await assert.rejects(prepareArticleSource({
      ...source, sourceType, sourceUrl: null, sourceHtml: null
    }, context), (error) => error instanceof AppError && error.code === errorCodes.INVALID_INPUT && error.message === message);
  }
  await assert.rejects(prepareArticleSource({
    ...source, sourceType: "URL", sourceUrl: "http://127.0.0.1/private"
  }, context), (error) => error instanceof AppError && error.code === errorCodes.URL_BLOCKED);
});

test("source read failures escape preparation unchanged for both stored snapshots and PDFs", async () => {
  const failure = new Error("source storage unavailable");
  for (const sourceType of ["HTML_SNAPSHOT", "PDF"]) {
    await assert.rejects(prepareArticleSource({
      ...source, sourceType, sourceHtml: null, sourceFilePath: "uploads/source"
    }, {
      readObject: async () => { throw failure; },
      storageBackend: "azure_blob", rawArtifactRetentionDays: 3, log: () => {}
    }), (error) => error === failure);
  }
});
