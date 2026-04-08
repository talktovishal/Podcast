import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRichSnippetCapture,
  parseSnippetPageMetadata,
  serializeSnippetPageMetadata
} from "../src/snippets/richCapture";

test("buildRichSnippetCapture derives reusable markdown and metadata from rich snippet inputs", () => {
  const capture = buildRichSnippetCapture({
    sourceUrl: "https://example.com/article",
    sourceTitle: "Example article",
    selectedText: "Selected text with link",
    selectedHtml: "<p>Selected <strong>text</strong> with <a href=\"https://example.com/link\">link</a></p>",
    contextHtml:
      "<article><h2>Important section</h2><p>Selected <strong>text</strong> with <a href=\"https://example.com/link\">link</a></p><p>More context follows.</p></article>",
    pageMetadata: {
      canonicalUrl: "https://example.com/article",
      siteName: "Example Site",
      description: "A concise summary of the page.",
      author: "Jane Writer",
      publishedAt: "2026-04-08T12:00:00Z",
      sectionHeadings: ["Main topic", "Important section"]
    }
  });

  assert.match(capture.selectionMarkdown || "", /\*\*text\*\*/);
  assert.match(capture.selectionMarkdown || "", /\[link\]\(https:\/\/example.com\/link\)/);
  assert.match(capture.contextMarkdown || "", /## Important section/);
  assert.match(capture.captureMarkdown || "", /Section path: Main topic > Important section/);
  assert.match(capture.captureMarkdown || "", /## Selected passage/);
  assert.equal(capture.pageMetadata?.siteName, "Example Site");
});

test("snippet page metadata round-trips through JSON storage", () => {
  const serialized = serializeSnippetPageMetadata({
    canonicalUrl: "https://example.com/article",
    siteName: "Example Site",
    sectionHeadings: ["Main topic", "Important section"]
  });

  assert.ok(serialized);
  assert.deepEqual(parseSnippetPageMetadata(serialized), {
    canonicalUrl: "https://example.com/article",
    siteName: "Example Site",
    sectionHeadings: ["Main topic", "Important section"]
  });
});
