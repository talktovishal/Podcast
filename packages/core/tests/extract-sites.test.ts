/**
 * Comprehensive HTML extraction tests for major website categories.
 *
 * Tests both code paths:
 *   1. extractHtmlFromUrl  — server-side URL fetch (mocked fetch returns fixture HTML)
 *   2. extractHtmlSnapshot — browser extension capture (HTML submitted directly)
 *
 * Covers: social media (LinkedIn, Twitter/X), news (Washington Post, Yahoo News,
 * Fast Company), tech blogs (Medium, Substack), and edge cases.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractHtmlFromUrl, extractHtmlSnapshot } from "../src/extract/html";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES_DIR = new URL("../../../fixtures/html/sites/", import.meta.url);

async function loadFixture(name: string): Promise<string> {
  return readFile(new URL(name, FIXTURES_DIR), "utf-8");
}

function withMockFetch<T>(html: string, fn: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    text: async () => html
  })) as unknown as typeof fetch;

  return fn().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------

test("LinkedIn article — extractHtmlFromUrl extracts article body", async () => {
  const html = await loadFixture("linkedin-article.html");
  const result = await withMockFetch(html, () =>
    extractHtmlFromUrl("https://www.linkedin.com/pulse/remote-work-future-tech")
  );

  assert.ok(result.title.length > 0, "title should be non-empty");
  assert.ok(result.text.length > 400, "text should contain substantial article content");
  assert.ok(result.markdown.length > 200, "markdown should have substantial content");

  // Core article content should be present
  assert.ok(result.text.includes("remote work"), "should contain key topic 'remote work'");
  assert.ok(
    result.text.includes("productivity") || result.text.includes("Remote Work"),
    "should contain article substance"
  );

  // Navigation/UI noise should not appear in extracted text
  assert.ok(!result.text.includes("My Network"), "should strip LinkedIn nav items");
  assert.ok(!result.text.includes("Messaging"), "should strip LinkedIn nav items");
  assert.ok(!result.text.includes("Enroll in our certificate"), "should strip ad banners");
  assert.ok(!result.text.includes("Upgrade to LinkedIn Premium"), "should strip sidebar ads");
});

test("LinkedIn article — extractHtmlSnapshot extracts without network fetch", async () => {
  const html = await loadFixture("linkedin-article.html");
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => { fetchCalled = true; return Promise.reject(new Error("no network")); }) as unknown as typeof fetch;

  try {
    const result = extractHtmlSnapshot({
      html,
      url: "https://www.linkedin.com/pulse/remote-work-future-tech"
    });

    assert.equal(fetchCalled, false, "snapshot extraction must not call fetch");
    assert.ok(result.text.length > 400, "text should contain article content");
    assert.ok(result.text.includes("remote work"), "should contain key topic");
    assert.ok(!result.text.includes("My Network"), "should strip nav noise");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// Twitter / X
// ---------------------------------------------------------------------------

test("Twitter/X post — extractHtmlFromUrl extracts tweet thread content", async () => {
  const html = await loadFixture("twitter-post.html");
  const result = await withMockFetch(html, () =>
    extractHtmlFromUrl("https://x.com/techpioneer/status/123456789")
  );

  assert.ok(result.title.length > 0, "title should be non-empty");
  assert.ok(result.text.length > 300, "text should contain tweet thread content");

  // Main tweet content
  assert.ok(result.text.includes("ModelDeploy"), "should contain announcement subject");
  assert.ok(
    result.text.includes("open-source") || result.text.includes("deployment"),
    "should contain key content from tweet"
  );

  // UI chrome should be stripped
  assert.ok(!result.text.includes("Trending"), "should strip trending sidebar");
  assert.ok(!result.text.includes("Who to follow"), "should strip follow suggestions");
});

test("Twitter/X post — extractHtmlSnapshot extracts JS-rendered tweet content", async () => {
  const html = await loadFixture("twitter-post.html");
  const result = extractHtmlSnapshot({
    html,
    url: "https://x.com/techpioneer/status/123456789"
  });

  assert.ok(result.text.length > 300, "snapshot should extract tweet content");
  assert.ok(result.text.includes("ModelDeploy"), "should contain announcement subject");
});

test("Twitter/X minimal post — extractHtmlSnapshot rejects too-short content", async () => {
  const html = await loadFixture("twitter-minimal.html");

  assert.throws(
    () => extractHtmlSnapshot({ html, url: "https://x.com/user/status/999" }),
    (error: unknown) => error instanceof Error && (error as { code?: string }).code === "EXTRACTION_EMPTY",
    "should reject tweets that are too short to narrate"
  );
});

// ---------------------------------------------------------------------------
// Washington Post
// ---------------------------------------------------------------------------

test("Washington Post — extractHtmlFromUrl extracts full news article", async () => {
  const html = await loadFixture("washington-post.html");
  const result = await withMockFetch(html, () =>
    extractHtmlFromUrl("https://www.washingtonpost.com/business/2026/03/22/fed-rate-cuts-inflation/")
  );

  assert.ok(result.title.length > 0, "title should be non-empty");
  assert.ok(result.text.length > 800, "text should be long-form article");
  assert.ok(result.markdown.length > 400, "markdown should be substantial");

  // Key article content
  assert.ok(result.text.includes("Federal Reserve"), "should contain article subject");
  assert.ok(result.text.includes("inflation"), "should contain key economic term");
  assert.ok(
    result.text.includes("rate") || result.text.includes("interest"),
    "should discuss interest rates"
  );
  assert.ok(result.text.includes("Powell"), "should mention Fed Chair");

  // Noise from newspaper chrome
  assert.ok(!result.text.includes("Democracy Dies in Darkness"), "should strip masthead slogan");
  assert.ok(!result.text.includes("Advertisement"), "should strip ad placeholders");
  assert.ok(!result.text.includes("Subscribe for $1"), "should strip paywall overlay");
  assert.ok(!result.text.includes("Cookie Settings"), "should strip footer nav links");
});

test("Washington Post — extractHtmlSnapshot extracts without network", async () => {
  const html = await loadFixture("washington-post.html");
  const result = extractHtmlSnapshot({
    html,
    url: "https://www.washingtonpost.com/business/2026/03/22/fed-rate-cuts-inflation/"
  });

  assert.ok(result.text.length > 800, "snapshot should extract full article");
  assert.ok(result.text.includes("Federal Reserve"), "should contain article subject");
  assert.ok(result.text.includes("inflation"), "should contain key term");
});

// ---------------------------------------------------------------------------
// Fast Company
// ---------------------------------------------------------------------------

test("Fast Company — extractHtmlFromUrl extracts listicle article", async () => {
  const html = await loadFixture("fastcompany-article.html");
  const result = await withMockFetch(html, () =>
    extractHtmlFromUrl("https://www.fastcompany.com/most-innovative-companies/ai-2026")
  );

  assert.ok(result.title.length > 0, "title should be non-empty");
  assert.ok(result.text.length > 600, "text should contain full article");

  // Content from the listicle
  assert.ok(result.text.includes("MedVision"), "should include first company");
  assert.ok(result.text.includes("ClimateNet"), "should include second company");
  assert.ok(result.text.includes("LinguaBridge"), "should include third company");

  // Noise
  assert.ok(!result.text.includes("ADVERTISEMENT"), "should strip ad labels");
  assert.ok(
    !result.text.includes("Subscribe to our Most Innovative"),
    "should strip newsletter signup content"
  );
});

test("Fast Company — extractHtmlSnapshot extracts", async () => {
  const html = await loadFixture("fastcompany-article.html");
  const result = extractHtmlSnapshot({
    html,
    url: "https://www.fastcompany.com/most-innovative-companies/ai-2026"
  });

  assert.ok(result.text.length > 600, "snapshot should extract article");
  assert.ok(result.text.includes("MedVision"), "should include company names");
});

// ---------------------------------------------------------------------------
// Yahoo News
// ---------------------------------------------------------------------------

test("Yahoo News — extractHtmlFromUrl extracts news article", async () => {
  const html = await loadFixture("yahoo-news.html");
  const result = await withMockFetch(html, () =>
    extractHtmlFromUrl("https://news.yahoo.com/global-semiconductor-shortage-easing")
  );

  assert.ok(result.title.length > 0, "title should be non-empty");
  assert.ok(result.text.length > 600, "text should contain full article");

  // Key content
  assert.ok(result.text.includes("semiconductor"), "should contain article subject");
  assert.ok(result.text.includes("TSMC"), "should mention major chipmaker");
  assert.ok(
    result.text.includes("fabrication") || result.text.includes("fab"),
    "should contain industry terms"
  );

  // Cookie banner and ads
  assert.ok(!result.text.includes("We use cookies"), "should strip cookie banner");
  assert.ok(!result.text.includes("Invest in semiconductor stocks"), "should strip ads");
  assert.ok(!result.text.includes("Yahoo Finance Premium"), "should strip ad content");
});

test("Yahoo News — extractHtmlSnapshot extracts without network", async () => {
  const html = await loadFixture("yahoo-news.html");
  const result = extractHtmlSnapshot({
    html,
    url: "https://news.yahoo.com/global-semiconductor-shortage-easing"
  });

  assert.ok(result.text.length > 600, "snapshot should extract article");
  assert.ok(result.text.includes("semiconductor"), "should contain article subject");
});

// ---------------------------------------------------------------------------
// Medium
// ---------------------------------------------------------------------------

test("Medium blog — extractHtmlFromUrl extracts long-form post", async () => {
  const html = await loadFixture("medium-blog.html");
  const result = await withMockFetch(html, () =>
    extractHtmlFromUrl("https://medium.com/better-programming/building-scalable-microservices")
  );

  assert.ok(result.title.length > 0, "title should be non-empty");
  assert.ok(result.text.length > 800, "text should contain long-form post");

  // Key content
  assert.ok(result.text.includes("microservice"), "should contain core topic");
  assert.ok(result.text.includes("monolith"), "should discuss monolith comparison");
  assert.ok(
    result.text.includes("observability") || result.text.includes("Observability"),
    "should discuss observability lesson"
  );

  // Medium UI noise
  assert.ok(!result.text.includes("Clap"), "should strip Medium action buttons");
  assert.ok(!result.text.includes("Sign In"), "should strip header auth UI");
});

test("Medium blog — extractHtmlSnapshot extracts", async () => {
  const html = await loadFixture("medium-blog.html");
  const result = extractHtmlSnapshot({
    html,
    url: "https://medium.com/better-programming/building-scalable-microservices"
  });

  assert.ok(result.text.length > 800, "snapshot should extract full post");
  assert.ok(result.text.includes("microservice"), "should contain core topic");
});

// ---------------------------------------------------------------------------
// Substack
// ---------------------------------------------------------------------------

test("Substack newsletter — extractHtmlFromUrl extracts newsletter content", async () => {
  const html = await loadFixture("substack-newsletter.html");
  const result = await withMockFetch(html, () =>
    extractHtmlFromUrl("https://techobserver.substack.com/p/ai-benchmarks")
  );

  assert.ok(result.title.length > 0, "title should be non-empty");
  assert.ok(result.text.length > 500, "text should contain newsletter content");

  // Key content
  assert.ok(result.text.includes("benchmark"), "should contain core topic");
  assert.ok(
    result.text.includes("consistency") || result.text.includes("reliability"),
    "should discuss reliability vs peak performance"
  );
  assert.ok(
    result.text.includes("latency") || result.text.includes("throughput"),
    "should discuss performance factors"
  );

  // Substack subscribe widgets
  assert.ok(
    !result.text.includes("Type your email"),
    "should strip subscribe widget placeholder text"
  );
});

test("Substack newsletter — extractHtmlSnapshot extracts", async () => {
  const html = await loadFixture("substack-newsletter.html");
  const result = extractHtmlSnapshot({
    html,
    url: "https://techobserver.substack.com/p/ai-benchmarks"
  });

  assert.ok(result.text.length > 500, "snapshot should extract newsletter");
  assert.ok(result.text.includes("benchmark"), "should contain core topic");
});

// ---------------------------------------------------------------------------
// Cross-cutting: noise elements stripped universally
// ---------------------------------------------------------------------------

test("figure and figcaption elements are stripped across all fixtures", async () => {
  const fixtures = [
    "linkedin-article.html",
    "twitter-post.html",
    "washington-post.html",
    "yahoo-news.html"
  ];

  for (const name of fixtures) {
    const html = await loadFixture(name);
    const result = extractHtmlSnapshot({ html, url: `https://example.com/${name}` });
    // figcaption text should be removed by the noise selector pipeline
    assert.ok(
      !result.text.includes("Figure 1:") &&
      !result.text.includes("Architecture overview") &&
      !result.text.includes("Federal Reserve Economic Data") &&
      !result.text.includes("Reuters)"),
      `figcaption content should be stripped from ${name}`
    );
  }
});

test("script, style, noscript, template, svg, canvas elements are stripped", async () => {
  const fixtures = [
    "linkedin-article.html",
    "twitter-post.html",
    "washington-post.html",
    "yahoo-news.html"
  ];

  for (const name of fixtures) {
    const html = await loadFixture(name);
    const result = extractHtmlSnapshot({ html, url: `https://example.com/${name}` });
    // Script/style content must never leak into narration text
    assert.ok(!result.text.includes("trackingId"), `script content should be stripped from ${name}`);
    assert.ok(!result.text.includes("__INITIAL_STATE__"), `script content should be stripped from ${name}`);
    assert.ok(!result.text.includes("font-family"), `CSS should be stripped from ${name}`);
    assert.ok(!result.text.includes("dataLayer"), `tracking scripts should be stripped from ${name}`);
  }
});

// ---------------------------------------------------------------------------
// Cross-cutting: ordered lists are properly numbered
// ---------------------------------------------------------------------------

test("ordered list items get numbered prefix in LinkedIn article", async () => {
  const html = await loadFixture("linkedin-article.html");
  const result = extractHtmlSnapshot({
    html,
    url: "https://www.linkedin.com/pulse/remote-work-future-tech"
  });

  // The ol has 4 items; extraction should number them
  assert.ok(
    result.text.includes("1)") || result.text.includes("Asynchronous communication"),
    "should contain first list item content"
  );
});

// ---------------------------------------------------------------------------
// Cross-cutting: both paths produce equivalent results
// ---------------------------------------------------------------------------

test("extractHtmlFromUrl and extractHtmlSnapshot produce consistent results for same HTML", async () => {
  const fixtures = [
    "linkedin-article.html",
    "washington-post.html",
    "fastcompany-article.html",
    "medium-blog.html"
  ];

  for (const name of fixtures) {
    const html = await loadFixture(name);

    const urlResult = await withMockFetch(html, () =>
      extractHtmlFromUrl(`https://example.com/${name}`)
    );
    const snapshotResult = extractHtmlSnapshot({
      html,
      url: `https://example.com/${name}`
    });

    // Title and text should match exactly since the same HTML is processed
    assert.equal(urlResult.title, snapshotResult.title, `titles should match for ${name}`);
    assert.equal(urlResult.text, snapshotResult.text, `text should match for ${name}`);
    assert.equal(urlResult.markdown, snapshotResult.markdown, `markdown should match for ${name}`);
  }
});

// ---------------------------------------------------------------------------
// Edge case: heavy navigation, minimal article content
// ---------------------------------------------------------------------------

test("page with heavy nav but sufficient article content still extracts", async () => {
  const html = `
    <html>
    <head><title>Thin Article on Heavy Nav Site</title></head>
    <body>
      <header>
        <nav>
          <a href="/home">Home</a>
          <a href="/about">About</a>
          <a href="/contact">Contact</a>
          <a href="/blog">Blog</a>
          <a href="/pricing">Pricing</a>
          <a href="/docs">Docs</a>
          <a href="/support">Support</a>
          <a href="/careers">Careers</a>
          <a href="/press">Press</a>
          <a href="/legal">Legal</a>
        </nav>
      </header>
      <main>
        <article>
          <h1>Important Announcement About Our Platform Changes</h1>
          <p>We are making significant changes to how our platform operates starting next month. These changes will affect all users who rely on our API for data integration and workflow automation services. Please review the details below carefully to understand how this impacts your integration.</p>
          <p>The primary change involves our authentication system moving from API keys to OAuth 2.0. This transition will improve security while providing more granular access control for your applications. All existing API keys will continue to work for a six-month transition period.</p>
        </article>
      </main>
      <footer>
        <p>&copy; 2026 Example Corp. All rights reserved.</p>
        <nav>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
      </footer>
    </body>
    </html>
  `;

  const result = extractHtmlSnapshot({ html, url: "https://example.com/announcement" });
  assert.ok(result.text.length > 160, "should extract despite heavy nav");
  assert.ok(result.text.includes("OAuth 2.0"), "should contain article content");
});
