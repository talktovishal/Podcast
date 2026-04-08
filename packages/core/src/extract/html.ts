import { AppError, errorCodes } from "../errors/codes";
import { Readability } from "@mozilla/readability";
import type { DefuddleResponse } from "defuddle";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { BRAND_BOT_USER_AGENT, BRAND_SNAPSHOT_FALLBACK_URL } from "../config/brand";
import { extractNarrationTextFromHtml, resolveTitleFromHtmlWithAbogenFallback } from "./abogen/htmlToText";
import { analyzeMarkdownQuality, lowSignalExtractionMessage, type MarkdownQualityAnalysis } from "./markdownCleanup";
import https from "node:https";
import http from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const FETCH_TIMEOUT_MS = 30_000;
const LEADING_PRESENTATION_LABELS = new Set(["watch now", "close", "[close](#)", "advertisement", "stories for you"]);
const IMAGE_ONLY_PARAGRAPH_PATTERN = /^!\[[\s\S]*?\]\([^)]+\)$/;
const LINKED_IMAGE_ONLY_PARAGRAPH_PATTERN = /^\[\s*!\[[\s\S]*?\]\([^)]+\)\s*(?:[^\]]*)\]\([^)]+\)$/i;
const KEY_POINTS_LABEL_PATTERN = /^#{0,6}\s*key points\s*$/i;
const CAPTION_LIKE_PARAGRAPH_PATTERN =
  /(?:^image caption\b|\b(?:getty images|associated press|ap photo|reuters|image source|toggle caption|hide caption)\b|^\(?photo by\b)/i;
const require = createRequire(import.meta.url);
const defuddleDistDir = dirname(require.resolve("defuddle"));
const { DefuddleClass } = require(join(defuddleDistDir, "node.js")) as {
  DefuddleClass: new (
    doc: Document,
    options?: {
      url?: string;
      useAsync?: boolean;
      includeReplies?: boolean;
    }
  ) => {
    parse(): DefuddleResponse;
  };
};
const { createMarkdownContent } = require(join(defuddleDistDir, "markdown.js")) as {
  createMarkdownContent: (content: string, url: string) => string;
};

type FetchResponseLike = {
  status: number;
  ok: boolean;
  text: () => Promise<string>;
};

export type HtmlFetchStrategy = "hostname" | "pinned" | "hostname_fallback";

export type HtmlFetchDiagnostics = {
  pinnedCandidateCount: number;
  pinnedAttempted: boolean;
  pinnedStatuses: number[];
  fallbackAttempted: boolean;
  fallbackStatus: number | null;
  finalFetchStrategy: HtmlFetchStrategy;
};

export type HtmlExtractionEngine = "readability" | "defuddle";
export type HtmlExtractionSelectionMode = "scored" | "readability_only" | "defuddle_only";
export type HtmlExtractionCandidateDiagnostics = {
  engine: HtmlExtractionEngine;
  status: "passed" | "failed";
  score: number | null;
  titleLength: number;
  textLength: number;
  markdownLength: number;
  rawIssueCount: number;
  cleanedIssueCount: number;
  hasNarratableText: boolean;
  leadingPresentationBlocks: number;
  standaloneImageParagraphs: number;
  captionLikeParagraphs: number;
  helpfulLeadSummary: boolean;
  warningCount: number;
  errorMessage?: string;
};
export type HtmlExtractionSelectionDiagnostics = {
  selectedEngine: HtmlExtractionEngine;
  selectionMode: HtmlExtractionSelectionMode;
  scoreMargin: number;
  candidates: HtmlExtractionCandidateDiagnostics[];
};

export const BLOCKED_SITE_HTML_SNAPSHOT_MESSAGE =
  "This site blocked server-side access. If the page opens in your browser, capture it with the Chrome extension instead of submitting the URL directly.";
export const BLOCKED_PAGE_HTML_SNAPSHOT_MESSAGE =
  "This captured page looks like a CAPTCHA or anti-bot interstitial instead of the article. Clear the site challenge in your browser, then capture again.";

type HtmlExtractionResult = {
  title: string;
  text: string;
  markdown: string;
  rawHtml: string;
  byline?: string | null;
  selectionDiagnostics: HtmlExtractionSelectionDiagnostics;
};

type HtmlExtractionResultWithDiagnostics = HtmlExtractionResult & {
  diagnostics: HtmlFetchDiagnostics;
};

type HtmlExtractionCandidate = {
  engine: HtmlExtractionEngine;
  title: string;
  byline: string | null;
  text: string;
  markdown: string;
  rawAnalysis: MarkdownQualityAnalysis;
  cleanedAnalysis: MarkdownQualityAnalysis;
  score: number;
  leadingPresentationBlocks: number;
  standaloneImageParagraphs: number;
  captionLikeParagraphs: number;
  helpfulLeadSummary: boolean;
  warningCount: number;
};

function pinnedIpv6Enabled(): boolean {
  const explicit = process.env.PINNED_FETCH_IPV6_ENABLED;
  if (explicit === "0") {
    return false;
  }
  if (explicit === "1") {
    return true;
  }
  return process.env.RUNTIME_PROFILE !== "azure";
}

function normalizeExtracted(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function wordCount(input: string): number {
  if (!input) {
    return 0;
  }
  return input.split(/\s+/g).filter(Boolean).length;
}

function substantialParagraphCount(markdown: string): number {
  return markdown
    .split(/\n{2,}/g)
    .map((paragraph) => paragraph.replace(/^#{1,6}\s+/gm, "").replace(/\s+/g, " ").trim())
    .filter((paragraph) => wordCount(paragraph) >= 12).length;
}

function hasStrongReadableArticleSignal(input: {
  html: string;
  sourceUrl: string;
}): boolean {
  try {
    const extracted = extractReadableWithAbogenCleanup(input.html, input.sourceUrl);
    const extractedWordCount = wordCount(normalizeExtracted(extracted.text));
    const paragraphCount = substantialParagraphCount(normalizeMarkdown(extracted.markdown));
    const extractedChars = normalizeExtracted(extracted.text).length;
    return (extractedWordCount >= 90 && paragraphCount >= 2) || (extractedChars >= 450 && paragraphCount >= 2);
  } catch {
    return false;
  }
}

function hasStrongDomArticleSignal(document: Document): boolean {
  const candidateParagraphs = Array.from(
    document.querySelectorAll("article p, main p, [role='article'] p, article li, main li, [role='article'] li")
  )
    .map((node) => normalizeExtracted(node.textContent || ""))
    .filter(Boolean);
  const substantialParagraphs = candidateParagraphs.filter((paragraph) => wordCount(paragraph) >= 12);
  const totalWords = substantialParagraphs.reduce((sum, paragraph) => sum + wordCount(paragraph), 0);
  return (substantialParagraphs.length >= 3 && totalWords >= 70) || (substantialParagraphs.length >= 2 && totalWords >= 100);
}

function countIssueTotal(analysis: MarkdownQualityAnalysis): number {
  return Object.values(analysis.issueCounts).reduce((sum, value) => sum + value, 0);
}

function splitMarkdownParagraphs(markdown: string): string[] {
  return markdown
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function normalizeParagraphLabel(paragraph: string): string {
  return paragraph.replace(/\s+/g, " ").trim().toLowerCase();
}

function isLeadingPresentationParagraph(paragraph: string): boolean {
  const normalized = normalizeParagraphLabel(paragraph);
  if (LEADING_PRESENTATION_LABELS.has(normalized)) {
    return true;
  }
  return IMAGE_ONLY_PARAGRAPH_PATTERN.test(paragraph) || LINKED_IMAGE_ONLY_PARAGRAPH_PATTERN.test(paragraph);
}

function countLeadingPresentationBlocks(markdown: string): number {
  let count = 0;
  for (const paragraph of splitMarkdownParagraphs(markdown)) {
    if (!isLeadingPresentationParagraph(paragraph)) {
      break;
    }
    count += 1;
  }
  return count;
}

function countStandaloneImageParagraphs(markdown: string): number {
  return splitMarkdownParagraphs(markdown).filter(
    (paragraph) => IMAGE_ONLY_PARAGRAPH_PATTERN.test(paragraph) || LINKED_IMAGE_ONLY_PARAGRAPH_PATTERN.test(paragraph)
  ).length;
}

function countCaptionLikeParagraphs(markdown: string): number {
  return splitMarkdownParagraphs(markdown).filter((paragraph) => {
    if (paragraph.length > 220) {
      return false;
    }
    return CAPTION_LIKE_PARAGRAPH_PATTERN.test(paragraph);
  }).length;
}

function hasHelpfulLeadSummary(markdown: string): boolean {
  const paragraphs = splitMarkdownParagraphs(markdown);
  let index = 0;
  while (index < paragraphs.length && isLeadingPresentationParagraph(paragraphs[index] || "")) {
    index += 1;
  }
  if (!KEY_POINTS_LABEL_PATTERN.test(paragraphs[index] || "")) {
    return false;
  }

  const bulletLines = (paragraphs[index + 1] || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
  return bulletLines.length >= 2;
}

function scoreHtmlExtractionCandidate(candidate: {
  title: string;
  byline: string | null;
  text: string;
  markdown: string;
  rawAnalysis: MarkdownQualityAnalysis;
  cleanedAnalysis: MarkdownQualityAnalysis;
}): Pick<
  HtmlExtractionCandidate,
  "score" | "leadingPresentationBlocks" | "standaloneImageParagraphs" | "captionLikeParagraphs" | "helpfulLeadSummary"
> {
  const narratableChars = candidate.cleanedAnalysis.narrationText.replace(/\s+/g, " ").trim().length;
  const normalizedTextLength = normalizeExtracted(candidate.text).length;
  const rawIssueCount = countIssueTotal(candidate.rawAnalysis);
  const cleanedIssueCount = countIssueTotal(candidate.cleanedAnalysis);
  const leadingPresentationBlocks = countLeadingPresentationBlocks(candidate.markdown);
  const standaloneImageParagraphs = countStandaloneImageParagraphs(candidate.markdown);
  const captionLikeParagraphs = countCaptionLikeParagraphs(candidate.text);
  const helpfulLeadSummary = hasHelpfulLeadSummary(candidate.markdown);

  let score = Math.min(5_000, narratableChars) + Math.min(1_500, normalizedTextLength);
  score -= cleanedIssueCount * 1_000;
  score -= rawIssueCount * 250;
  score -= leadingPresentationBlocks * 175;
  score -= standaloneImageParagraphs * 125;
  score -= captionLikeParagraphs * 175;
  if (helpfulLeadSummary) {
    score += 150;
  }
  if (candidate.title.trim()) {
    score += 50;
  }
  if (candidate.byline?.trim()) {
    score += 10;
  }

  return {
    score,
    leadingPresentationBlocks,
    standaloneImageParagraphs,
    captionLikeParagraphs,
    helpfulLeadSummary
  };
}

function buildCandidateDiagnostics(candidate: HtmlExtractionCandidate): HtmlExtractionCandidateDiagnostics {
  return {
    engine: candidate.engine,
    status: "passed",
    score: candidate.score,
    titleLength: candidate.title.length,
    textLength: candidate.text.length,
    markdownLength: candidate.markdown.length,
    rawIssueCount: countIssueTotal(candidate.rawAnalysis),
    cleanedIssueCount: countIssueTotal(candidate.cleanedAnalysis),
    hasNarratableText: candidate.cleanedAnalysis.hasNarratableText,
    leadingPresentationBlocks: candidate.leadingPresentationBlocks,
    standaloneImageParagraphs: candidate.standaloneImageParagraphs,
    captionLikeParagraphs: candidate.captionLikeParagraphs,
    helpfulLeadSummary: candidate.helpfulLeadSummary,
    warningCount: candidate.warningCount
  };
}

function buildFailedCandidateDiagnostics(engine: HtmlExtractionEngine, error: unknown): HtmlExtractionCandidateDiagnostics {
  return {
    engine,
    status: "failed",
    score: null,
    titleLength: 0,
    textLength: 0,
    markdownLength: 0,
    rawIssueCount: 0,
    cleanedIssueCount: 0,
    hasNarratableText: false,
    leadingPresentationBlocks: 0,
    standaloneImageParagraphs: 0,
    captionLikeParagraphs: 0,
    helpfulLeadSummary: false,
    warningCount: 0,
    errorMessage: error instanceof Error ? error.message : String(error)
  };
}

function selectPreferredExtractionError(currentError: unknown, defuddleError: unknown, fallbackMessage: string): AppError {
  const mappedCurrent = mapHtmlExtractionError(currentError, fallbackMessage);
  const mappedDefuddle = mapHtmlExtractionError(defuddleError, fallbackMessage);
  return preferMoreSpecificError(mappedCurrent, mappedDefuddle);
}

export function htmlToMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-"
  });
  return normalizeMarkdown(turndown.turndown(html));
}

function extractReadableWithAbogenCleanup(html: string, sourceUrl: string): {
  title: string;
  byline: string | null;
  text: string;
  markdown: string;
} {
  const dom = new JSDOM(html, { url: sourceUrl });
  try {
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article) {
      throw new Error("Readability failed to extract article");
    }

    const fallbackTitle = resolveTitleFromHtmlWithAbogenFallback(html, "Untitled");
    const articleHtml = article.content || "";
    const title =
      article.title?.trim() ||
      resolveTitleFromHtmlWithAbogenFallback(articleHtml, fallbackTitle) ||
      "Untitled";
    const text = extractNarrationTextFromHtml(articleHtml || html);
    const markdown = htmlToMarkdown(articleHtml || html);

    return {
      title,
      byline: article.byline?.trim() || null,
      text,
      markdown
    };
  } finally {
    dom.window.close();
  }
}

function extractReadabilityCandidate(input: { html: string; sourceUrl: string }): HtmlExtractionCandidate {
  const extracted = extractReadableWithAbogenCleanup(input.html, input.sourceUrl);
  const text = normalizeExtracted(extracted.text);
  const markdown = extracted.markdown && extracted.markdown.length >= 40 ? extracted.markdown : normalizeExtracted(text);
  if (text.length < 160) {
    throw new AppError(errorCodes.EXTRACTION_EMPTY, lowSignalExtractionMessage, 400);
  }

  const rawAnalysis = analyzeMarkdownQuality(markdown);
  const cleanedAnalysis = analyzeMarkdownQuality(rawAnalysis.cleanedMarkdown);
  const score = scoreHtmlExtractionCandidate({
    title: extracted.title || "Untitled",
    byline: extracted.byline,
    text,
    markdown,
    rawAnalysis,
    cleanedAnalysis
  });

  return {
    engine: "readability",
    title: extracted.title || "Untitled",
    byline: extracted.byline,
    text,
    markdown,
    rawAnalysis,
    cleanedAnalysis,
    score: score.score,
    leadingPresentationBlocks: score.leadingPresentationBlocks,
    standaloneImageParagraphs: score.standaloneImageParagraphs,
    captionLikeParagraphs: score.captionLikeParagraphs,
    helpfulLeadSummary: score.helpfulLeadSummary,
    warningCount: 0
  };
}

function parseDefuddleMarkdown(html: string, sourceUrl: string): { result: DefuddleResponse; warningCount: number } {
  const dom = new JSDOM(html, { url: sourceUrl });
  try {
    const defuddle = new DefuddleClass(dom.window.document, {
      url: sourceUrl,
      useAsync: false,
      includeReplies: false
    });
    const suppressedWarnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      suppressedWarnings.push(args.map((value) => String(value)).join(" "));
    };
    try {
      const result = defuddle.parse();
      const markdown = result.content ? createMarkdownContent(result.content, sourceUrl) : "";
      result.content = markdown;
      result.contentMarkdown = markdown;
      return {
        result,
        warningCount: suppressedWarnings.length
      };
    } finally {
      console.warn = originalWarn;
    }
  } finally {
    dom.window.close();
  }
}

function extractDefuddleCandidate(input: { html: string; sourceUrl: string }): HtmlExtractionCandidate {
  const { result, warningCount } = parseDefuddleMarkdown(input.html, input.sourceUrl);
  const markdown = normalizeMarkdown((result.contentMarkdown || result.content || "").trim());
  if (!markdown) {
    throw new AppError(errorCodes.EXTRACTION_EMPTY, lowSignalExtractionMessage, 400);
  }

  const rawAnalysis = analyzeMarkdownQuality(markdown);
  const cleanedAnalysis = analyzeMarkdownQuality(rawAnalysis.cleanedMarkdown);
  if (!cleanedAnalysis.hasNarratableText) {
    throw new AppError(errorCodes.EXTRACTION_EMPTY, lowSignalExtractionMessage, 400);
  }

  const text = normalizeExtracted(cleanedAnalysis.narrationText);
  const title = result.title?.trim() || resolveTitleFromHtmlWithAbogenFallback(input.html, "Untitled") || "Untitled";
  const byline = result.author?.trim() || null;
  const score = scoreHtmlExtractionCandidate({
    title,
    byline,
    text,
    markdown,
    rawAnalysis,
    cleanedAnalysis
  });

  return {
    engine: "defuddle",
    title,
    byline,
    text,
    markdown,
    rawAnalysis,
    cleanedAnalysis,
    score: score.score,
    leadingPresentationBlocks: score.leadingPresentationBlocks,
    standaloneImageParagraphs: score.standaloneImageParagraphs,
    captionLikeParagraphs: score.captionLikeParagraphs,
    helpfulLeadSummary: score.helpfulLeadSummary,
    warningCount
  };
}

function extractFromHtml(input: {
  html: string;
  sourceUrl: string;
}): HtmlExtractionResult {
  const attempts: Array<
    | { engine: HtmlExtractionEngine; status: "passed"; candidate: HtmlExtractionCandidate }
    | { engine: HtmlExtractionEngine; status: "failed"; error: unknown }
  > = [];

  try {
    attempts.push({
      engine: "readability",
      status: "passed",
      candidate: extractReadabilityCandidate(input)
    });
  } catch (error) {
    attempts.push({
      engine: "readability",
      status: "failed",
      error
    });
  }

  try {
    attempts.push({
      engine: "defuddle",
      status: "passed",
      candidate: extractDefuddleCandidate(input)
    });
  } catch (error) {
    attempts.push({
      engine: "defuddle",
      status: "failed",
      error
    });
  }

  const successful = attempts.filter((attempt) => attempt.status === "passed") as Array<{
    engine: HtmlExtractionEngine;
    status: "passed";
    candidate: HtmlExtractionCandidate;
  }>;

  if (successful.length === 0) {
    const readabilityFailure = attempts.find((attempt) => attempt.engine === "readability" && attempt.status === "failed") as
      | { engine: HtmlExtractionEngine; status: "failed"; error: unknown }
      | undefined;
    const defuddleFailure = attempts.find((attempt) => attempt.engine === "defuddle" && attempt.status === "failed") as
      | { engine: HtmlExtractionEngine; status: "failed"; error: unknown }
      | undefined;
    throw selectPreferredExtractionError(
      readabilityFailure?.error,
      defuddleFailure?.error,
      lowSignalExtractionMessage
    );
  }

  let selected = successful[0]!.candidate;
  let selectionMode: HtmlExtractionSelectionMode = successful[0]!.engine === "readability" ? "readability_only" : "defuddle_only";
  let scoreMargin = 0;

  if (successful.length === 2) {
    const readabilityCandidate = successful.find((attempt) => attempt.engine === "readability")!.candidate;
    const defuddleCandidate = successful.find((attempt) => attempt.engine === "defuddle")!.candidate;
    selected = defuddleCandidate.score > readabilityCandidate.score ? defuddleCandidate : readabilityCandidate;
    selectionMode = "scored";
    scoreMargin = Math.abs(defuddleCandidate.score - readabilityCandidate.score);
  }

  const selectionDiagnostics: HtmlExtractionSelectionDiagnostics = {
    selectedEngine: selected.engine,
    selectionMode,
    scoreMargin,
    candidates: attempts.map((attempt) =>
      attempt.status === "passed"
        ? buildCandidateDiagnostics(attempt.candidate)
        : buildFailedCandidateDiagnostics(attempt.engine, attempt.error)
    )
  };

  return {
    title: selected.title || "Untitled",
    byline: selected.byline,
    text: selected.text,
    markdown: selected.markdown,
    rawHtml: input.html,
    selectionDiagnostics
  };
}

function detectCapturedPageInterstitial(input: {
  html: string;
  sourceUrl: string;
}): { code: "challenge_frame" | "interstitial_text" } | null {
  const dom = new JSDOM(input.html, { url: input.sourceUrl });
  try {
    const titleText = normalizeExtracted(dom.window.document.title || "").toLowerCase();
    const bodyText = normalizeExtracted(dom.window.document.body?.textContent || dom.window.document.documentElement?.textContent || "").toLowerCase();
    const rawHtml = input.html.toLowerCase();
    const combinedText = `${titleText} ${bodyText}`.trim();
    const bodyWordCount = wordCount(bodyText);
    const challengeInfrastructurePattern =
      /\bcloudflare\b|\bcf-wrapper\b|\bcdn-cgi\b|\bchallenge-platform\b|\bturnstile\b|\brecaptcha\b|\bdatadome\b/;
    const hasChallengeInfrastructure = challengeInfrastructurePattern.test(`${combinedText} ${rawHtml}`);
    const hasStrongArticleSignal = hasStrongReadableArticleSignal(input) || hasStrongDomArticleSignal(dom.window.document);

    const challengeFramePattern = /(captcha-delivery|datadome|captcha|challenge|recaptcha|turnstile|challenge-platform)/;
    const hasVisibleChallengeFrame = Array.from(dom.window.document.querySelectorAll("iframe")).some((frame) => {
      const signal = `${frame.getAttribute("src") || ""} ${frame.getAttribute("title") || ""} ${frame.getAttribute("name") || ""}`.toLowerCase();
      if (!challengeFramePattern.test(signal)) {
        return false;
      }

      if (frame.hidden || frame.getAttribute("aria-hidden") === "true") {
        return false;
      }

      const inlineStyle = (frame.getAttribute("style") || "").toLowerCase();
      if (inlineStyle.includes("display:none") || inlineStyle.includes("visibility:hidden")) {
        return false;
      }

      const computed = dom.window.getComputedStyle(frame);
      if (computed.display === "none" || computed.visibility === "hidden") {
        return false;
      }

      return true;
    });

    const hardBlockPatterns = [
      /\battention required\b/,
      /\bsorry, you have been blocked\b/,
      /\bwhy have i been blocked\b/,
      /\bcloudflare ray id\b/,
      /\bperformance [& ] security by cloudflare\b/
    ];
    const strongBlockPatterns = [
      /\bjust a moment\b/,
      /\bchecking your browser\b/,
      /\bverify you are human\b/,
      /\benable javascript and cookies to continue\b/
    ];
    const supportingBlockPatterns = [
      /\bunable to access\b/,
      /\bsecurity service to protect itself from online attacks\b/,
      /\bcaptcha\b/,
      /\bchallenge\b/,
      /\bturnstile\b/,
      /\brecaptcha\b/,
      /\bdatadome\b/,
      /\baccess denied\b/,
      /\bbot verification\b/,
      /\bchallenge-platform\b/
    ];

    const strongMatches = strongBlockPatterns.filter((pattern) => pattern.test(combinedText)).length;
    const supportingMatches = supportingBlockPatterns.filter((pattern) => pattern.test(`${combinedText} ${rawHtml}`)).length;
    const hardBlockMatches = hardBlockPatterns.filter((pattern) => pattern.test(combinedText)).length;

    if (hardBlockMatches >= 1) {
      return { code: "interstitial_text" };
    }

    if (hasVisibleChallengeFrame && !hasStrongArticleSignal) {
      return { code: "challenge_frame" };
    }

    if ((strongMatches >= 2 || (strongMatches >= 1 && supportingMatches >= 1)) && !hasStrongArticleSignal) {
      return { code: "interstitial_text" };
    }

    const lightweightChallengeTextPatterns = [
      /^(?:verifying|just a moment)\.{0,3}$/,
      /\bverifying\b/,
      /\bchecking if the site connection is secure\b/,
      /\bplease wait while we verify\b/
    ];
    const lightweightMatches = lightweightChallengeTextPatterns.filter((pattern) => pattern.test(combinedText)).length;
    if (hasChallengeInfrastructure && lightweightMatches >= 1 && bodyWordCount <= 120 && !hasStrongArticleSignal) {
      return { code: "interstitial_text" };
    }

    return null;
  } finally {
    dom.window.close();
  }
}

function mapFetchStatusToAppError(status: number): AppError {
  if (status === 401 || status === 403) {
    return new AppError(
      errorCodes.EXTRACTION_FAILED,
      "This site blocked access (login/paywall/bot protection). Try another URL.",
      400
    );
  }

  if (status === 404) {
    return new AppError(errorCodes.EXTRACTION_FAILED, "The URL returned 404 (not found).", 404);
  }

  if (status === 429) {
    return new AppError(
      errorCodes.EXTRACTION_FAILED,
      "This site is rate-limiting requests. Please retry in a few minutes.",
      429
    );
  }

  if (status >= 500) {
    return new AppError(
      errorCodes.EXTRACTION_FAILED,
      `The source site is temporarily unavailable (${status}). Please retry later.`,
      502
    );
  }

  return new AppError(
    errorCodes.EXTRACTION_FAILED,
    `Could not fetch this URL (${status}). Retry once, or try a different source.`,
    400
  );
}

function mapNetworkErrorToAppError(error: unknown): AppError {
  const err = error instanceof Error ? error : new Error(String(error));
  const causeCode = (err as { cause?: { code?: string } }).cause?.code;
  const directCode = (err as { code?: string }).code;
  const code = directCode || causeCode || "";

  if (err.name === "AbortError" || code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT") {
    return new AppError(
      errorCodes.EXTRACTION_FAILED,
      "The source site timed out while fetching content. Retry or try another URL.",
      504
    );
  }

  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return new AppError(
      errorCodes.EXTRACTION_FAILED,
      "Could not resolve the source host right now. Please retry shortly.",
      502
    );
  }

  if (code === "ECONNRESET" || code === "ECONNREFUSED") {
    return new AppError(
      errorCodes.EXTRACTION_FAILED,
      "Could not connect to the source site. Retry later or use a different URL.",
      502
    );
  }

  if (code === "ENETUNREACH" || code === "EHOSTUNREACH" || code === "ENETDOWN") {
    return new AppError(
      errorCodes.EXTRACTION_FAILED,
      "This server cannot currently reach the source host network. Please retry shortly.",
      502
    );
  }

  if (code === "ERR_INVALID_IP_ADDRESS" || code === "ERR_INVALID_ARG_TYPE" || code === "ERR_INVALID_ADDRESS_FAMILY" || /invalid ip address/i.test(err.message)) {
    return new AppError(
      errorCodes.EXTRACTION_FAILED,
      "Could not connect to the source site. Retry later or use a different URL.",
      502
    );
  }

  return new AppError(
    errorCodes.EXTRACTION_FAILED,
    "Could not fetch this URL. Retry once; if it fails again, the site likely blocks automated access.",
    400
  );
}

function mapHtmlExtractionError(error: unknown, fallbackMessage: string): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError(errorCodes.EXTRACTION_EMPTY, fallbackMessage, 400);
}

function errorSpecificityScore(error: AppError): number {
  const message = error.userMessage.toLowerCase();
  if (message.includes("chrome extension instead")) {
    return 95;
  }
  if (message.includes("blocked access")) {
    return 90;
  }
  if (error.status === 429 || message.includes("rate-limiting")) {
    return 80;
  }
  if (error.status === 404) {
    return 70;
  }
  if (error.code === errorCodes.EXTRACTION_EMPTY) {
    return 60;
  }
  if (error.status === 504 || message.includes("timed out")) {
    return 50;
  }
  if (message.includes("cannot currently reach") || message.includes("could not connect") || message.includes("could not resolve")) {
    return 45;
  }
  if (error.status >= 500) {
    return 40;
  }
  return 10;
}

function preferMoreSpecificError(current: AppError | null, candidate: AppError): AppError {
  if (!current) {
    return candidate;
  }
  return errorSpecificityScore(candidate) > errorSpecificityScore(current) ? candidate : current;
}

function cloneDiagnostics(diagnostics: HtmlFetchDiagnostics): HtmlFetchDiagnostics {
  return {
    pinnedCandidateCount: diagnostics.pinnedCandidateCount,
    pinnedAttempted: diagnostics.pinnedAttempted,
    pinnedStatuses: [...diagnostics.pinnedStatuses],
    fallbackAttempted: diagnostics.fallbackAttempted,
    fallbackStatus: diagnostics.fallbackStatus,
    finalFetchStrategy: diagnostics.finalFetchStrategy
  };
}

function throwIfCapturedPageInterstitial(input: { html: string; sourceUrl: string }, message: string): void {
  const accessInterstitial = detectCapturedPageInterstitial(input);
  if (accessInterstitial) {
    throw new AppError(errorCodes.EXTRACTION_FAILED, message, 400);
  }
}

function attachFetchDiagnostics(error: AppError, diagnostics: HtmlFetchDiagnostics): AppError {
  return Object.assign(error, {
    fetchDiagnostics: cloneDiagnostics(diagnostics)
  }) as AppError;
}

export function getHtmlFetchDiagnostics(error: unknown): HtmlFetchDiagnostics | null {
  if (!error || typeof error !== "object" || !("fetchDiagnostics" in error)) {
    return null;
  }
  const diagnostics = (error as { fetchDiagnostics?: unknown }).fetchDiagnostics;
  if (!diagnostics || typeof diagnostics !== "object") {
    return null;
  }
  return diagnostics as HtmlFetchDiagnostics;
}

function isBlockedFetchStatus(status: number | null | undefined): boolean {
  return status === 401 || status === 403;
}

export function shouldSuggestHtmlSnapshotForError(error: unknown): boolean {
  if (!(error instanceof AppError) || error.code !== errorCodes.EXTRACTION_FAILED) {
    return false;
  }

  if (error.userMessage === BLOCKED_SITE_HTML_SNAPSHOT_MESSAGE) {
    return true;
  }

  const diagnostics = getHtmlFetchDiagnostics(error);
  if (!diagnostics) {
    return false;
  }

  if (diagnostics.fallbackAttempted) {
    return isBlockedFetchStatus(diagnostics.fallbackStatus);
  }

  return diagnostics.pinnedStatuses.length > 0 && diagnostics.pinnedStatuses.every((status) => isBlockedFetchStatus(status));
}

function createFetchDiagnostics(pinnedCandidates: string[]): HtmlFetchDiagnostics {
  return {
    pinnedCandidateCount: pinnedCandidates.length,
    pinnedAttempted: pinnedCandidates.length > 0,
    pinnedStatuses: [],
    fallbackAttempted: false,
    fallbackStatus: null,
    finalFetchStrategy: pinnedCandidates.length > 0 ? "pinned" : "hostname"
  };
}

/**
 * Fetch a URL while pinning the TCP connection to a pre-resolved IP address.
 * This closes the TOCTOU DNS-rebinding window between validation and fetch.
 */
function fetchWithPinnedIp(urlStr: string, resolvedIp: string, timeoutMs: number): Promise<FetchResponseLike> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const isHttps = parsedUrl.protocol === "https:";
    const family: 4 | 6 = resolvedIp.includes(":") ? 6 : 4;
    const mod = isHttps ? https : http;
    const port = parsedUrl.port ? Number(parsedUrl.port) : (isHttps ? 443 : 80);
    const agent = new mod.Agent({
      lookup: (
        _hostname: string,
        optionsOrCallback: unknown,
        maybeCallback?: (err: Error | null, address: string, family: number) => void
      ) => {
        const callback =
          typeof optionsOrCallback === "function"
            ? (optionsOrCallback as (err: Error | null, address: string, family: number) => void)
            : maybeCallback;
        const options =
          typeof optionsOrCallback === "object" && optionsOrCallback !== null
            ? (optionsOrCallback as { all?: boolean })
            : null;
        if (!callback) {
          return;
        }
        if (options?.all) {
          (callback as unknown as (err: Error | null, addresses: Array<{ address: string; family: number }>) => void)(
            null,
            [{ address: resolvedIp, family }]
          );
          return;
        }
        callback(null, resolvedIp, family);
      }
    } as ConstructorParameters<typeof https.Agent>[0]);

    let settled = false;
    const settleResolve = (response: FetchResponseLike) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(response);
    };
    const settleReject = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    const timer = setTimeout(() => {
      req.destroy(Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }));
    }, timeoutMs);

    const req = mod.request(
      {
        hostname: parsedUrl.hostname,
        port,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: "GET",
        family,
        headers: { "user-agent": BRAND_BOT_USER_AGENT, host: parsedUrl.host },
        agent
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 200;
          settleResolve({ status, ok: status >= 200 && status < 300, text: () => Promise.resolve(body) });
        });
        res.on("error", settleReject);
      }
    );
    req.on("socket", (socket) => {
      socket.on("error", settleReject);
    });
    req.on("error", settleReject);
    req.end();
  });
}

async function fetchWithHostname(urlStr: string, timeoutMs: number): Promise<FetchResponseLike> {
  const response = await fetch(urlStr, {
    method: "GET",
    headers: { "user-agent": BRAND_BOT_USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs)
  });
  return {
    status: response.status,
    ok: response.ok,
    text: () => response.text()
  };
}

function normalizePinnedIpCandidates(resolvedIp?: string | string[]): string[] {
  const candidates = Array.isArray(resolvedIp) ? resolvedIp : resolvedIp ? [resolvedIp] : [];
  const unique = new Set<string>();
  const allowIpv6 = pinnedIpv6Enabled();
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (!normalized) {
      continue;
    }
    if (!allowIpv6 && normalized.includes(":")) {
      continue;
    }
    unique.add(normalized);
  }
  return Array.from(unique).sort((left, right) => {
    const leftIsIpv6 = left.includes(":");
    const rightIsIpv6 = right.includes(":");
    if (leftIsIpv6 === rightIsIpv6) {
      return 0;
    }
    return leftIsIpv6 ? 1 : -1;
  });
}

function shouldTryNextPinnedIp(error: unknown): boolean {
  const err = error instanceof Error ? error : new Error(String(error));
  const causeCode = (err as { cause?: { code?: string } }).cause?.code;
  const directCode = (err as { code?: string }).code;
  const code = directCode || causeCode || "";
  return (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "EHOSTUNREACH" ||
    code === "ENETUNREACH" ||
    code === "ENETDOWN" ||
    code === "EAI_AGAIN" ||
    code === "ETIMEDOUT" ||
    code === "ERR_INVALID_IP_ADDRESS" ||
    code === "ERR_INVALID_ARG_TYPE" ||
    code === "ERR_INVALID_ADDRESS_FAMILY" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_HEADERS_TIMEOUT"
  );
}

function shouldTryNextPinnedResponse(status: number): boolean {
  return status === 403 || status === 429 || status >= 500;
}

async function attemptHostnameFallback(
  url: string,
  diagnostics: HtmlFetchDiagnostics,
  preferredError: AppError
): Promise<HtmlExtractionResultWithDiagnostics> {
  diagnostics.fallbackAttempted = true;
  diagnostics.finalFetchStrategy = "hostname_fallback";

  let response: FetchResponseLike;
  try {
    response = await fetchWithHostname(url, FETCH_TIMEOUT_MS);
  } catch (error) {
    throw attachFetchDiagnostics(preferMoreSpecificError(preferredError, mapNetworkErrorToAppError(error)), diagnostics);
  }

  diagnostics.fallbackStatus = response.status;
  if (!response.ok) {
    throw attachFetchDiagnostics(preferMoreSpecificError(preferredError, mapFetchStatusToAppError(response.status)), diagnostics);
  }

  const html = await response.text();
  try {
    throwIfCapturedPageInterstitial({ html, sourceUrl: url }, BLOCKED_SITE_HTML_SNAPSHOT_MESSAGE);
    return {
      ...extractFromHtml({ html, sourceUrl: url }),
      diagnostics: cloneDiagnostics(diagnostics)
    };
  } catch (error) {
    const extractionError = mapHtmlExtractionError(error, "Could not extract readable content from this URL.");
    throw attachFetchDiagnostics(preferMoreSpecificError(preferredError, extractionError), diagnostics);
  }
}

export async function extractHtmlFromUrlWithDiagnostics(url: string, resolvedIp?: string | string[]): Promise<HtmlExtractionResultWithDiagnostics> {
  const pinnedCandidates = normalizePinnedIpCandidates(resolvedIp);
  const diagnostics = createFetchDiagnostics(pinnedCandidates);

  if (pinnedCandidates.length === 0) {
    let response: FetchResponseLike;
    try {
      response = await fetchWithHostname(url, FETCH_TIMEOUT_MS);
    } catch (error) {
      throw attachFetchDiagnostics(mapNetworkErrorToAppError(error), diagnostics);
    }

    if (!response.ok) {
      throw attachFetchDiagnostics(mapFetchStatusToAppError(response.status), diagnostics);
    }

    const html = await response.text();
    try {
      throwIfCapturedPageInterstitial({ html, sourceUrl: url }, BLOCKED_SITE_HTML_SNAPSHOT_MESSAGE);
      return {
        ...extractFromHtml({ html, sourceUrl: url }),
        diagnostics: cloneDiagnostics(diagnostics)
      };
    } catch (error) {
      throw attachFetchDiagnostics(mapHtmlExtractionError(error, "Could not extract readable content from this URL."), diagnostics);
    }
  }

  let preferredError: AppError | null = null;
  let pinnedResponse: FetchResponseLike | null = null;

  for (let index = 0; index < pinnedCandidates.length; index += 1) {
    const candidate = pinnedCandidates[index]!;
    const isLastCandidate = index === pinnedCandidates.length - 1;
    try {
      const response = await fetchWithPinnedIp(url, candidate, FETCH_TIMEOUT_MS);
      diagnostics.pinnedStatuses.push(response.status);

      if (!response.ok) {
        preferredError = preferMoreSpecificError(preferredError, mapFetchStatusToAppError(response.status));
        if (shouldTryNextPinnedResponse(response.status) && !isLastCandidate) {
          continue;
        }
      }

      pinnedResponse = response;
      break;
    } catch (error) {
      preferredError = preferMoreSpecificError(preferredError, mapNetworkErrorToAppError(error));
      if (shouldTryNextPinnedIp(error) && !isLastCandidate) {
        continue;
      }
      break;
    }
  }

  if (!pinnedResponse) {
    return attemptHostnameFallback(
      url,
      diagnostics,
      preferredError ??
        new AppError(
          errorCodes.EXTRACTION_FAILED,
          "Could not fetch this URL. Retry once; if it fails again, the site likely blocks automated access.",
          400
        )
    );
  }

  if (!pinnedResponse.ok) {
    return attemptHostnameFallback(url, diagnostics, preferMoreSpecificError(preferredError, mapFetchStatusToAppError(pinnedResponse.status)));
  }

  const html = await pinnedResponse.text();
  try {
    throwIfCapturedPageInterstitial({ html, sourceUrl: url }, BLOCKED_SITE_HTML_SNAPSHOT_MESSAGE);
    return {
      ...extractFromHtml({ html, sourceUrl: url }),
      diagnostics: cloneDiagnostics(diagnostics)
    };
  } catch (error) {
    const extractionError = mapHtmlExtractionError(error, "Could not extract readable content from this URL.");
    return attemptHostnameFallback(url, diagnostics, preferMoreSpecificError(preferredError, extractionError));
  }
}

export function extractHtmlSnapshot(input: {
  html: string;
  url?: string;
}): {
  title: string;
  text: string;
  markdown: string;
  rawHtml: string;
  byline?: string | null;
  selectionDiagnostics: HtmlExtractionSelectionDiagnostics;
} {
  const sourceUrl = input.url || BRAND_SNAPSHOT_FALLBACK_URL;
  throwIfCapturedPageInterstitial(
    {
      html: input.html,
      sourceUrl
    },
    BLOCKED_PAGE_HTML_SNAPSHOT_MESSAGE
  );

  try {
    return extractFromHtml({
      html: input.html,
      sourceUrl
    });
  } catch (error) {
    throw mapHtmlExtractionError(error, "Could not extract readable content from this page snapshot.");
  }
}

export async function extractHtmlFromUrl(url: string, resolvedIp?: string | string[]): Promise<HtmlExtractionResult> {
  const extracted = await extractHtmlFromUrlWithDiagnostics(url, resolvedIp);
  return {
    title: extracted.title,
    text: extracted.text,
    markdown: extracted.markdown,
    rawHtml: extracted.rawHtml,
    byline: extracted.byline,
    selectionDiagnostics: extracted.selectionDiagnostics
  };
}
