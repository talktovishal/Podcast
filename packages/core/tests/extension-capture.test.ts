import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { extractHtmlSnapshot } from "../src/extract/html";
// @ts-ignore -- the extension helper ships as a browser module and is imported directly for jsdom-based tests.
import { capturePageSnapshot } from "../../../apps/extension/capture-page.mjs";

function createDom(html: string, url = "https://example.com/article"): JSDOM {
  return new JSDOM(html, {
    url
  });
}

test("capturePageSnapshot reveals article content behind a load more button", async () => {
  const dom = createDom(`
    <!doctype html>
    <html>
      <head><title>Load More Article</title></head>
      <body>
        <article>
          <h1>Load More Article</h1>
          <p>This opening paragraph has enough text to identify the article root safely for capture.</p>
          <div id="hidden-copy" hidden>
            <p>The hidden continuation becomes visible after the smart capture clicks the load more button.</p>
            <p>It should remain readable by the server extraction pipeline after snapshot cleanup.</p>
          </div>
          <button id="expand" type="button">Load more</button>
        </article>
      </body>
    </html>
  `);

  try {
    const hiddenCopy = dom.window.document.getElementById("hidden-copy");
    const expandButton = dom.window.document.getElementById("expand");
    expandButton?.addEventListener("click", () => {
      hiddenCopy?.removeAttribute("hidden");
      expandButton.remove();
    });

    const result = await capturePageSnapshot({
      window: dom.window,
      document: dom.window.document,
      settleMs: 0,
      scrollBudget: 0
    });

    assert.equal(result.ok, true);
    assert.ok(result.stats?.revealClicks && result.stats.revealClicks >= 1);

    const extracted = extractHtmlSnapshot({
      html: result.html,
      url: "https://example.com/article"
    });
    assert.match(extracted.text, /hidden continuation becomes visible/i);
  } finally {
    dom.window.close();
  }
});

test("capturePageSnapshot can reveal lazy-loaded article content during bounded scroll", async () => {
  const dom = createDom(`
    <!doctype html>
    <html>
      <head><title>Lazy Scroll Article</title></head>
      <body>
        <main>
          <article id="story">
            <h1>Lazy Scroll Article</h1>
            <p>This article starts visible and should trigger the main content detection without needing a button click first.</p>
          </article>
        </main>
      </body>
    </html>
  `);

  try {
    let loaded = false;
    dom.window.scrollBy = (() => {
      if (loaded) {
        return;
      }
      loaded = true;
      const story = dom.window.document.getElementById("story");
      const paragraph = dom.window.document.createElement("p");
      paragraph.textContent =
        "Additional paragraphs appear after the first bounded scroll pass so the final snapshot contains the complete article body.";
      story?.appendChild(paragraph);
    }) as typeof dom.window.scrollBy;

    const result = await capturePageSnapshot({
      window: dom.window,
      document: dom.window.document,
      settleMs: 0,
      clickBudget: 0,
      scrollBudget: 2
    });

    assert.equal(result.ok, true);
    assert.ok(result.stats?.scrollPasses && result.stats.scrollPasses >= 1);

    const extracted = extractHtmlSnapshot({
      html: result.html,
      url: "https://example.com/article"
    });
    assert.match(extracted.text, /additional paragraphs appear after the first bounded scroll pass/i);
  } finally {
    dom.window.close();
  }
});

test("capturePageSnapshot stays conservative on thread-like hosts", async () => {
  const dom = createDom(
    `
      <!doctype html>
      <html>
        <head><title>Thread Host</title></head>
        <body>
          <article>
            <h1>Thread Host</h1>
            <p>This content is visible already and should be captured, but the extension should avoid aggressive thread expansion.</p>
            <div id="reply-copy" hidden>
              <p>This reply-only content should stay hidden in conservative host mode.</p>
            </div>
            <button id="show-more" type="button">Show more replies</button>
          </article>
        </body>
      </html>
    `,
    "https://x.com/example/status/123"
  );

  try {
    const hiddenReply = dom.window.document.getElementById("reply-copy");
    const showMore = dom.window.document.getElementById("show-more");
    showMore?.addEventListener("click", () => {
      hiddenReply?.removeAttribute("hidden");
    });

    const result = await capturePageSnapshot({
      window: dom.window,
      document: dom.window.document,
      settleMs: 0
    });

    assert.equal(result.ok, true);
    assert.equal(result.stats?.conservativeHost, true);
    assert.equal(result.stats?.revealClicks, 0);
    assert.ok(!result.html.includes("reply-only content"));
  } finally {
    dom.window.close();
  }
});

test("capturePageSnapshot removes inert nodes while preserving server extractability", async () => {
  const dom = createDom(`
    <!doctype html>
    <html>
      <head>
        <title>Cleanup Article</title>
        <style>.hidden { display: none; }</style>
        <script>window.__noise = true;</script>
      </head>
      <body>
        <!-- page shell comment -->
        <article>
          <h1>Cleanup Article</h1>
          <p>This article should still extract cleanly after the extension removes inert nodes from the cloned snapshot.</p>
          <p>The server needs the document structure intact, but it does not need scripts, styles, templates, or comments.</p>
          <template><p>Template-only content</p></template>
          <noscript>Fallback content</noscript>
        </article>
      </body>
    </html>
  `);

  try {
    const result = await capturePageSnapshot({
      window: dom.window,
      document: dom.window.document,
      settleMs: 0,
      scrollBudget: 0
    });

    assert.equal(result.ok, true);
    assert.ok(!result.html.includes("<script"));
    assert.ok(!result.html.includes("<style"));
    assert.ok(!result.html.includes("<template"));
    assert.ok(!result.html.includes("<noscript"));
    assert.ok(!result.html.includes("page shell comment"));

    const extracted = extractHtmlSnapshot({
      html: result.html,
      url: "https://example.com/cleanup"
    });
    assert.match(extracted.text, /should still extract cleanly/i);
    assert.match(extracted.text, /does not need scripts, styles, templates, or comments/i);
  } finally {
    dom.window.close();
  }
});

test("capturePageSnapshot fails clearly when safe cleanup still exceeds the byte budget", async () => {
  const dom = createDom(`
    <!doctype html>
    <html>
      <head><title>Large Article</title></head>
      <body>
        <article>
          <h1>Large Article</h1>
          <p>${"Visible content ".repeat(200)}</p>
        </article>
      </body>
    </html>
  `);

  try {
    const result = await capturePageSnapshot({
      window: dom.window,
      document: dom.window.document,
      settleMs: 0,
      scrollBudget: 0,
      byteLimit: 800
    });

    assert.equal(result.ok, false);
    assert.match(result.errorMessage || "", /too large after safe cleanup/i);
  } finally {
    dom.window.close();
  }
});
