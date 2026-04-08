import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
// @ts-ignore -- extension helper ships as a browser module and is imported directly for tests.
import { buildSnippetPayload, createSnippetContextMenuItems, submitSelectionSnippet } from "../../../apps/extension/snippet-service.mjs";
// @ts-ignore -- extension helper ships as a browser module and is imported directly for tests.
import { captureRichSnippetDetails } from "../../../apps/extension/snippet-capture.mjs";

test("createSnippetContextMenuItems registers both selection-only actions", () => {
  const items = createSnippetContextMenuItems();

  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item: { contexts: string[] }) => item.contexts),
    [["selection"], ["selection"]],
  );
  assert.equal(items[0]?.title, "Save selection to ArticlePod");
  assert.equal(items[1]?.title, "Save selection with comment to ArticlePod...");
});

test("buildSnippetPayload keeps rich capture fields while trimming selection and optional comment", () => {
  const payload = buildSnippetPayload({
    sourceUrl: "https://example.com/article",
    sourceTitle: "Example title",
    selectedText: "  Saved text  ",
    selectedHtml: " <p>Saved <strong>text</strong></p> ",
    contextHtml: " <section><h2>Context</h2><p>Saved <strong>text</strong> inside the article.</p></section> ",
    pageMetadata: {
      siteName: " Example Site ",
      sectionHeadings: [" Top ", " Details "]
    },
    comment: "  useful context  ",
  });

  assert.deepEqual(payload, {
    sourceUrl: "https://example.com/article",
    sourceTitle: "Example title",
    selectedText: "Saved text",
    selectedHtml: "<p>Saved <strong>text</strong></p>",
    contextHtml: "<section><h2>Context</h2><p>Saved <strong>text</strong> inside the article.</p></section>",
    pageMetadata: {
      siteName: " Example Site ",
      sectionHeadings: [" Top ", " Details "]
    },
    comment: "useful context",
  });
});

test("captureRichSnippetDetails collects selection structure and page metadata", () => {
  const dom = new JSDOM(
    `
      <!doctype html>
      <html lang="en">
        <head>
          <title>Example article</title>
          <meta property="og:title" content="Example article">
          <meta property="og:site_name" content="Example Site">
          <meta name="description" content="A concise article description.">
          <meta name="author" content="Jane Writer">
          <meta property="article:published_time" content="2026-04-08T12:00:00Z">
          <link rel="canonical" href="https://example.com/articles/example-article">
        </head>
        <body>
          <article>
            <h1>Main topic</h1>
            <h2>Important section</h2>
            <p id="target">
              This sentence includes a <a href="https://example.com/reference">reference link</a> and some structured text.
            </p>
          </article>
        </body>
      </html>
    `,
    {
      url: "https://example.com/articles/example-article?ref=feed"
    }
  );

  try {
    const paragraph = dom.window.document.getElementById("target");
    assert.ok(paragraph?.firstChild);
    const range = dom.window.document.createRange();
    range.setStart(paragraph.firstChild!, 0);
    range.setEnd(paragraph.lastChild!, paragraph.lastChild!.textContent?.length || 0);
    const selection = dom.window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const result = captureRichSnippetDetails({
      window: dom.window,
      document: dom.window.document,
      location: dom.window.location
    });

    assert.equal(result.ok, true);
    assert.equal(result.sourceUrl, "https://example.com/articles/example-article");
    assert.equal(result.sourceTitle, "Example article");
    assert.match(result.selectedText || "", /reference link/);
    assert.match(result.selectedHtml || "", /<a href="https:\/\/example.com\/reference">reference link<\/a>/);
    assert.match(result.contextHtml || "", /reference link/);
    assert.deepEqual(result.pageMetadata?.sectionHeadings, ["Main topic", "Important section"]);
    assert.equal(result.pageMetadata?.siteName, "Example Site");
    assert.equal(result.pageMetadata?.author, "Jane Writer");
  } finally {
    dom.window.close();
  }
});

test("submitSelectionSnippet includes comment when saving a comment-backed snippet", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;

  const response = await submitSelectionSnippet({
    serverUrl: "https://articlepod.example",
    extensionToken: "secret-token",
    sourceUrl: "https://example.com/highlight",
    sourceTitle: "Highlighted article",
    selectedText: "Important selection",
    selectedHtml: "<p>Important <strong>selection</strong></p>",
    contextHtml: "<article><h1>Highlighted article</h1><p>Important <strong>selection</strong></p></article>",
    pageMetadata: {
      siteName: "Example Site",
      sectionHeadings: ["Highlighted article"]
    },
    comment: "follow up later",
    fetchImpl: async (url: string, init: RequestInit) => {
      requestedUrl = String(url);
      requestedInit = init;
      return {
        ok: true,
        json: async () => ({ ok: true, snippet: { id: "snippet-1" } }),
      };
    },
  });

  assert.equal(requestedUrl, "https://articlepod.example/api/snippets");
  assert.equal(requestedInit?.method, "POST");
  const headers = requestedInit?.headers as Record<string, string> | undefined;
  assert.equal(headers?.authorization, "Bearer secret-token");
  assert.deepEqual(JSON.parse(String(requestedInit?.body)), {
    sourceUrl: "https://example.com/highlight",
    sourceTitle: "Highlighted article",
    selectedText: "Important selection",
    selectedHtml: "<p>Important <strong>selection</strong></p>",
    contextHtml: "<article><h1>Highlighted article</h1><p>Important <strong>selection</strong></p></article>",
    pageMetadata: {
      siteName: "Example Site",
      sectionHeadings: ["Highlighted article"]
    },
    comment: "follow up later",
  });
  assert.deepEqual(response, { ok: true, snippet: { id: "snippet-1" } });
});
