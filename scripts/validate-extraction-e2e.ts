#!/usr/bin/env tsx
/**
 * End-to-end validation of HTML extraction for major website categories.
 *
 * Runs the full extraction pipeline (Readability + abogen cleanup) on each
 * site fixture and prints detailed results: title, byline, text length,
 * text preview, markdown preview, and quality checks.
 *
 * Both ingestion paths are validated:
 *   1. extractHtmlFromUrl  (server-side fetch — simulated with fixture HTML)
 *   2. extractHtmlSnapshot (browser extension capture — direct HTML input)
 *
 * Usage:  cd packages/core && ./node_modules/.bin/tsx ../../scripts/validate-extraction-e2e.ts
 */
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractHtmlFromUrl, extractHtmlSnapshot } from "@articlepod/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "../fixtures/html/sites");

// Fixtures that are intentionally too short to narrate (edge-case tests)
const EXPECTED_FAILURES = new Set(["twitter-minimal.html"]);

// Simulated URLs for the URL-fetch path (just needs a plausible host for Readability)
const FIXTURE_URLS: Record<string, string> = {
  "linkedin-article.html": "https://www.linkedin.com/pulse/remote-work-future-tech",
  "twitter-post.html": "https://x.com/techpioneer/status/123456789",
  "twitter-minimal.html": "https://x.com/user/status/999",
  "washington-post.html": "https://www.washingtonpost.com/business/2026/03/22/fed-rate-cuts/",
  "fastcompany-article.html": "https://www.fastcompany.com/most-innovative-companies/ai-2026",
  "yahoo-news.html": "https://news.yahoo.com/semiconductor-shortage-easing",
  "medium-blog.html": "https://medium.com/better-programming/building-scalable-microservices",
  "substack-newsletter.html": "https://techobserver.substack.com/p/ai-benchmarks"
};

// Known noise strings that should NOT appear in extracted text
const NOISE_PATTERNS = [
  // Navigation / UI chrome
  "My Network", "Messaging", "Who to follow", "Trending",
  // Ads / promos
  "ADVERTISEMENT", "Advertisement", "Enroll in our certificate",
  "Upgrade to LinkedIn Premium", "Yahoo Finance Premium",
  "Invest in semiconductor stocks",
  // Cookie/privacy banners
  "We use cookies", "Cookie Settings",
  // Paywall
  "Subscribe for $1",
  // Tracking/script content
  "trackingId", "__INITIAL_STATE__", "dataLayer", "font-family",
  // Figcaption content (should be stripped)
  "Figure 1:", "Architecture overview", "Federal Reserve Economic Data"
];

interface ValidationResult {
  fixture: string;
  path: "url_fetch" | "snapshot";
  ok: boolean;
  error?: string;
  title?: string;
  byline?: string | null;
  textLength?: number;
  markdownLength?: number;
  textPreview?: string;
  noiseFound: string[];
}

function truncate(text: string, maxLen: number): string {
  const clean = text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}

function checkNoise(text: string): string[] {
  return NOISE_PATTERNS.filter((pattern) => text.includes(pattern));
}

async function validateFixture(filename: string, html: string): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const url = FIXTURE_URLS[filename] || `https://example.com/${filename}`;

  // Path 1: extractHtmlSnapshot (browser extension capture)
  try {
    const snapshot = extractHtmlSnapshot({ html, url });
    const noiseFound = checkNoise(snapshot.text);
    results.push({
      fixture: filename,
      path: "snapshot",
      ok: true,
      title: snapshot.title,
      byline: snapshot.byline,
      textLength: snapshot.text.length,
      markdownLength: snapshot.markdown.length,
      textPreview: truncate(snapshot.text, 200),
      noiseFound
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    results.push({
      fixture: filename,
      path: "snapshot",
      ok: false,
      error,
      noiseFound: []
    });
  }

  // Path 2: extractHtmlFromUrl (server-side fetch, mocked)
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    text: async () => html
  })) as unknown as typeof fetch;

  try {
    const urlResult = await extractHtmlFromUrl(url);
    const noiseFound = checkNoise(urlResult.text);
    results.push({
      fixture: filename,
      path: "url_fetch",
      ok: true,
      title: urlResult.title,
      byline: urlResult.byline,
      textLength: urlResult.text.length,
      markdownLength: urlResult.markdown.length,
      textPreview: truncate(urlResult.text, 200),
      noiseFound
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    results.push({
      fixture: filename,
      path: "url_fetch",
      ok: false,
      error,
      noiseFound: []
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  return results;
}

async function main(): Promise<void> {
  const files = (await readdir(FIXTURES_DIR)).filter((f) => f.endsWith(".html")).sort();
  console.log(`\n${"=".repeat(80)}`);
  console.log("  END-TO-END HTML EXTRACTION VALIDATION");
  console.log(`  Fixtures: ${files.length} files from fixtures/html/sites/`);
  console.log(`${"=".repeat(80)}\n`);

  let totalPassed = 0;
  let totalFailed = 0;
  let totalExpectedFailures = 0;
  let totalNoiseIssues = 0;

  for (const file of files) {
    const html = await readFile(join(FIXTURES_DIR, file), "utf-8");
    const results = await validateFixture(file, html);

    console.log(`\n${"─".repeat(80)}`);
    console.log(`  📄 ${file}`);
    console.log(`${"─".repeat(80)}`);

    for (const r of results) {
      const pathLabel = r.path === "snapshot" ? "🔌 Extension Snapshot" : "🌐 URL Fetch";

      if (r.ok) {
        totalPassed++;
        console.log(`  ${pathLabel}  ✅ OK`);
        console.log(`    Title:     "${r.title}"`);
        if (r.byline) console.log(`    Byline:    "${r.byline}"`);
        console.log(`    Text:      ${r.textLength} chars`);
        console.log(`    Markdown:  ${r.markdownLength} chars`);
        console.log(`    Preview:   ${r.textPreview}`);

        if (r.noiseFound.length > 0) {
          totalNoiseIssues++;
          console.log(`    ⚠️  NOISE FOUND: ${r.noiseFound.join(", ")}`);
        } else {
          console.log(`    🧹 No noise detected`);
        }
      } else {
        const isExpected = EXPECTED_FAILURES.has(r.fixture);
        if (isExpected) {
          totalExpectedFailures++;
          console.log(`  ${pathLabel}  ⏭️  EXPECTED FAILURE (too-short edge case)`);
          console.log(`    Error: ${r.error}`);
        } else {
          totalFailed++;
          console.log(`  ${pathLabel}  ❌ FAILED`);
          console.log(`    Error: ${r.error}`);
        }
      }
    }
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log("  SUMMARY");
  console.log(`${"=".repeat(80)}`);
  console.log(`  Total extractions: ${totalPassed + totalFailed + totalExpectedFailures}`);
  console.log(`  ✅ Passed: ${totalPassed}`);
  console.log(`  ⏭️  Expected failures: ${totalExpectedFailures}`);
  console.log(`  ❌ Unexpected failures: ${totalFailed}`);
  console.log(`  ⚠️  Noise issues: ${totalNoiseIssues}`);

  if (totalFailed > 0 || totalNoiseIssues > 0) {
    console.log(`\n  ⚠️  Some issues detected — review above for details.\n`);
    process.exit(1);
  } else {
    console.log(`\n  ✅ All extractions passed with clean output!\n`);
  }
}

void main();
