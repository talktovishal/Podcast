import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Readability } from "@mozilla/readability";
import { DefuddleClass } from "defuddle/node";
import { extractHtmlFromUrl, extractHtmlSnapshot } from "../src/extract/html";
import { AppError, errorCodes } from "../src/errors/codes";

// Synthetic layouts exercise extraction, not live-site access or browser capture.
const fixtures = [
  {
    file: "linkedin-article.html",
    url: "https://www.linkedin.com/pulse/remote-work-future-tech",
    minTextLength: 400,
    content: ["remote work", "productivity", "1) Asynchronous communication"],
    noise: ["My Network", "Messaging", "Enroll in our certificate", "Upgrade to LinkedIn Premium", "Figure 1:", "trackingId"]
  },
  {
    file: "twitter-post.html",
    url: "https://x.com/techpioneer/status/123456789",
    minTextLength: 300,
    content: ["ModelDeploy", "open-source", "deployment"],
    noise: ["Trending", "Who to follow", "Architecture overview"]
  },
  {
    file: "washington-post.html",
    url: "https://www.washingtonpost.com/business/2026/03/22/fed-rate-cuts-inflation/",
    minTextLength: 800,
    content: ["Federal Reserve", "inflation", "Powell"],
    noise: ["Democracy Dies in Darkness", "Advertisement", "Subscribe for $1", "Cookie Settings", "Federal Reserve Economic Data", "dataLayer"]
  },
  {
    file: "fastcompany-article.html",
    url: "https://www.fastcompany.com/most-innovative-companies/ai-2026",
    minTextLength: 600,
    content: ["MedVision", "ClimateNet", "LinguaBridge"],
    noise: ["ADVERTISEMENT", "Subscribe to our Most Innovative"]
  },
  {
    file: "yahoo-news.html",
    url: "https://news.yahoo.com/global-semiconductor-shortage-easing",
    minTextLength: 600,
    content: ["semiconductor", "TSMC", "fabrication"],
    noise: ["We use cookies", "Invest in semiconductor stocks", "Yahoo Finance Premium", "(Reuters)"]
  },
  {
    file: "medium-blog.html",
    url: "https://medium.com/better-programming/building-scalable-microservices",
    minTextLength: 800,
    content: ["microservice", "monolith", "observability"],
    noise: ["Clap", "Sign In"]
  },
  {
    file: "substack-newsletter.html",
    url: "https://techobserver.substack.com/p/ai-benchmarks",
    minTextLength: 500,
    content: ["benchmark", "consistency", "latency"],
    noise: ["Type your email"]
  }
];

function loadFixture(file: string): Promise<string> {
  return readFile(new URL(`../../../fixtures/html/sites/${file}`, import.meta.url), "utf8");
}

for (const fixture of fixtures) {
  test(`synthetic ${fixture.file}: both extraction paths preserve content and remove chrome`, async (t) => {
    const html = await loadFixture(fixture.file);
    const fetchMock = t.mock.method(globalThis, "fetch", async () =>
      new Response(html, { status: 200, headers: { "content-type": "text/html" } })
    );

    const snapshot = extractHtmlSnapshot({ html, url: fixture.url });
    assert.equal(fetchMock.mock.callCount(), 0, "snapshot extraction must not fetch");
    assert.ok(snapshot.title.trim().length > 0);
    assert.ok(snapshot.text.length > fixture.minTextLength, "article body must remain substantial");
    assert.ok(snapshot.markdown.length > 80);

    for (const text of fixture.content) {
      assert.ok(snapshot.text.includes(text), `missing article content: ${text}`);
    }
    for (const text of fixture.noise) {
      assert.ok(html.includes(text), `fixture no longer models noise: ${text}`);
      assert.ok(!snapshot.text.includes(text), `unexpected narration noise: ${text}`);
    }

    const fetched = await extractHtmlFromUrl(fixture.url);
    assert.equal(fetchMock.mock.callCount(), 1);
    assert.deepEqual(
      { title: fetched.title, text: fetched.text, markdown: fetched.markdown },
      { title: snapshot.title, text: snapshot.text, markdown: snapshot.markdown }
    );
  });
}

for (const engine of ["readability", "defuddle"] as const) {
  test(`${engine} removes inline ad slots without deleting article prose or similar classes`, (t) => {
    const failOtherEngine = () => { throw new Error("Controlled alternate-engine failure"); };
    if (engine === "readability") {
      t.mock.method(DefuddleClass.prototype, "parse", failOtherEngine);
    } else {
      t.mock.method(Readability.prototype, "parse", failOtherEngine);
    }
    const html = `
      <html><head><title>Publishing systems and advertising</title></head><body>
        <article class="caas-body">
          <h1>Publishing systems and advertising</h1>
          <p>Article body remains readable while publishing systems distinguish commercial
          placements from the substantive reporting readers came to understand. This
          distinction is important for preserving accurate and complete narration.</p>
          <div class="caas-da"><p>Promotional placement should not reach the reader's narration.</p></div>
          <div class="caas-data"><p>Meaningful article data stays intact. The surrounding
          discussion describes how publishers organize their documents and maintain
          clear boundaries between reporting and commercial placements.</p></div>
          <p>Ad: is an example label discussed by this article. Ordinary prose about
          advertising must remain available, even when it mentions a label also used
          by commercial content elsewhere on the page.</p>
        </article>
      </body></html>`;
    const result = extractHtmlSnapshot({ html, url: "https://example.com/ad-container-boundary" });
    assert.equal(result.selectionDiagnostics.selectedEngine, engine);
    for (const output of [result.text, result.markdown]) {
      assert.ok(!output.includes("Promotional placement"));
      assert.match(output, /Article body remains readable/);
      assert.match(output, /Meaningful article data stays intact/);
      assert.match(output, /Ad: is an example label/);
    }
    assert.equal(result.rawHtml, html);
  });
}

test("synthetic short post fails explicitly on both extraction paths", async (t) => {
  const html = await loadFixture("twitter-minimal.html");
  const url = "https://x.com/user/status/999";
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    new Response(html, { status: 200, headers: { "content-type": "text/html" } })
  );
  const isEmptyExtraction = (error: unknown) =>
    error instanceof AppError && error.code === errorCodes.EXTRACTION_EMPTY;

  assert.throws(() => extractHtmlSnapshot({ html, url }), isEmptyExtraction);
  assert.equal(fetchMock.mock.callCount(), 0);
  await assert.rejects(() => extractHtmlFromUrl(url), isEmptyExtraction);
  assert.equal(fetchMock.mock.callCount(), 1);
});
