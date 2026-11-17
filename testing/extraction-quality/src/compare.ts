import { chromium, type Browser, type Page } from "@playwright/test";
import { dirname, join } from "node:path";
import { HTML_SNAPSHOT_MAX_BYTES, capturePageSnapshot } from "../../../apps/extension/capture-page.mjs";
import { extractHtmlFromUrlWithDiagnostics, extractHtmlSnapshot } from "../../../packages/core/src/extract/html.ts";
import { analyzeMarkdownQuality } from "../../../packages/core/src/extract/markdownCleanup.ts";
import { filterCorpus, loadCorpus } from "./corpus.js";
import { classifyComparison } from "./diff.js";
import { EXPORT_ROOT } from "./paths.js";
import { buildCompareSummary, writeCompareReports } from "./report.js";
import type { CliOptions, ComparisonEntryResult, CorpusEntry, PathExtractionResult } from "./types.js";
import { ensureDir, runWithConcurrency, safeFileName, timestampSlug, writeJson, writeText } from "./utils.js";

async function preparePage(url: string, page: Page): Promise<void> {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });
  await page.waitForTimeout(1_500);
}

async function captureFailureScreenshot(page: Page, screenshotPath: string): Promise<string | null> {
  try {
    await ensureDir(dirname(screenshotPath));
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });
    return screenshotPath;
  } catch {
    return null;
  }
}

async function runUrlPath(entry: CorpusEntry): Promise<PathExtractionResult> {
  const startedAt = Date.now();
  try {
    const extracted = await extractHtmlFromUrlWithDiagnostics(entry.url);
    const rawAnalysis = analyzeMarkdownQuality(extracted.markdown);
    const cleanedAnalysis = analyzeMarkdownQuality(rawAnalysis.cleanedMarkdown);
    return {
      path: "url",
      status: "passed",
      sourceUrl: entry.url,
      title: extracted.title,
      rawMarkdown: extracted.markdown,
      cleanedMarkdown: rawAnalysis.cleanedMarkdown,
      rawAnalysis,
      cleanedAnalysis,
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      path: "url",
      status: "failed",
      sourceUrl: entry.url,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}

async function runExtensionPath(entry: CorpusEntry, browser: Browser, reportDir: string): Promise<PathExtractionResult> {
  const startedAt = Date.now();
  const page = await browser.newPage();
  try {
    await preparePage(entry.url, page);
    const snapshot = await page.evaluate(capturePageSnapshot, {
      byteLimit: HTML_SNAPSHOT_MAX_BYTES
    });

    if (!snapshot?.ok || !snapshot.html) {
      const screenshotPath = await captureFailureScreenshot(
        page,
        join(reportDir, "screenshots", `${safeFileName(entry.id)}-extension-failure.png`)
      );
      return {
        path: "extension",
        status: "failed",
        sourceUrl: entry.url,
        durationMs: Date.now() - startedAt,
        errorMessage: snapshot?.errorMessage || "capturePageSnapshot returned no HTML.",
        screenshotPath,
        captureStats: snapshot?.stats || null
      };
    }

    const extracted = extractHtmlSnapshot({
      html: snapshot.html,
      url: snapshot.url || entry.url
    });
    const rawAnalysis = analyzeMarkdownQuality(extracted.markdown);
    const cleanedAnalysis = analyzeMarkdownQuality(rawAnalysis.cleanedMarkdown);
    return {
      path: "extension",
      status: "passed",
      sourceUrl: entry.url,
      title: extracted.title,
      rawMarkdown: extracted.markdown,
      cleanedMarkdown: rawAnalysis.cleanedMarkdown,
      rawAnalysis,
      cleanedAnalysis,
      durationMs: Date.now() - startedAt,
      captureStats: snapshot.stats || null
    };
  } catch (error) {
    const screenshotPath = await captureFailureScreenshot(
      page,
      join(reportDir, "screenshots", `${safeFileName(entry.id)}-extension-failure.png`)
    );
    return {
      path: "extension",
      status: "failed",
      sourceUrl: entry.url,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : String(error),
      screenshotPath
    };
  } finally {
    await page.close();
  }
}

async function writeTargetArtifacts(reportDir: string, result: ComparisonEntryResult): Promise<void> {
  const targetDir = join(reportDir, "targets", safeFileName(result.entry.id));
  await ensureDir(targetDir);

  if (result.urlResult?.rawMarkdown) {
    await writeText(join(targetDir, "url.raw.md"), `${result.urlResult.rawMarkdown}\n`);
  }
  if (result.urlResult?.cleanedMarkdown) {
    await writeText(join(targetDir, "url.cleaned.md"), `${result.urlResult.cleanedMarkdown}\n`);
  }
  if (result.extensionResult?.rawMarkdown) {
    await writeText(join(targetDir, "extension.raw.md"), `${result.extensionResult.rawMarkdown}\n`);
  }
  if (result.extensionResult?.cleanedMarkdown) {
    await writeText(join(targetDir, "extension.cleaned.md"), `${result.extensionResult.cleanedMarkdown}\n`);
  }

  await writeJson(join(targetDir, "comparison.json"), {
    entry: result.entry,
    severity: result.severity,
    normalizedMatch: result.normalizedMatch,
    diffSummary: result.diffSummary,
    rerunRecommended: result.rerunRecommended,
    url: result.urlResult
      ? {
          status: result.urlResult.status,
          title: result.urlResult.title,
          durationMs: result.urlResult.durationMs,
          errorMessage: result.urlResult.errorMessage,
          issueCounts: result.urlResult.rawAnalysis?.issueCounts || null,
          cleanedIssueCounts: result.urlResult.cleanedAnalysis?.issueCounts || null
        }
      : null,
    extension: result.extensionResult
      ? {
          status: result.extensionResult.status,
          title: result.extensionResult.title,
          durationMs: result.extensionResult.durationMs,
          errorMessage: result.extensionResult.errorMessage,
          issueCounts: result.extensionResult.rawAnalysis?.issueCounts || null,
          cleanedIssueCounts: result.extensionResult.cleanedAnalysis?.issueCounts || null,
          captureStats: result.extensionResult.captureStats || null,
          screenshotPath: result.extensionResult.screenshotPath || null
        }
      : null
  });
}

export async function runBulkComparison(options: CliOptions): Promise<{ reportDir: string; results: ComparisonEntryResult[] }> {
  const corpus = filterCorpus(await loadCorpus(options.inputPath), options);
  if (corpus.length === 0) {
    throw new Error("No corpus entries matched the supplied filters.");
  }

  const reportDir = join(EXPORT_ROOT, timestampSlug(), "bulk");
  await ensureDir(join(reportDir, "targets"));
  await ensureDir(join(reportDir, "screenshots"));

  const urlResults = new Map<string, PathExtractionResult>();
  const extensionResults = new Map<string, PathExtractionResult>();

  if (options.mode === "url" || options.mode === "dual") {
    const laneResults = await runWithConcurrency(corpus, options.concurrencyUrl, async (entry) => await runUrlPath(entry));
    for (const [index, result] of laneResults.entries()) {
      urlResults.set(corpus[index]?.id || String(index), result);
    }
  }

  if (options.mode === "extension" || options.mode === "dual") {
    const browser = await chromium.launch({
      channel: "chromium",
      headless: !options.headed
    });
    try {
      const laneResults = await runWithConcurrency(
        corpus,
        options.concurrencyExtension,
        async (entry) => await runExtensionPath(entry, browser, reportDir)
      );
      for (const [index, result] of laneResults.entries()) {
        extensionResults.set(corpus[index]?.id || String(index), result);
      }
    } finally {
      await browser.close();
    }
  }

  const results: ComparisonEntryResult[] = [];
  for (const entry of corpus) {
    const urlResult = urlResults.get(entry.id);
    const extensionResult = extensionResults.get(entry.id);
    const diagnostics = classifyComparison(urlResult, extensionResult);
    const result: ComparisonEntryResult = {
      entry,
      urlResult,
      extensionResult,
      ...diagnostics
    };
    results.push(result);
    await writeTargetArtifacts(reportDir, result);
  }

  await writeCompareReports(results, buildCompareSummary(results), reportDir);
  return {
    reportDir,
    results
  };
}
