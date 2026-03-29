const IMAGE_LINK_PATTERN = /\[\s*!\[[\s\S]*?\]\([^)]+\)\s*\]\([^)]+\)/g;
const IMAGE_PATTERN = /!\[[\s\S]*?\]\([^)]+\)/g;
const EMPTY_LINK_PATTERN = /\[\s*\]\([^)]+\)/g;
const LINK_PATTERN = /\[([^\]]+)\]\([^)]+\)/g;
const DANGLING_LINK_LINE_PATTERN = /^\s*\]\([^)]+\)\s*$/gm;
const EMPTY_LINK_LINE_PATTERN = /^\s*\[\]\([^)]+\)\s*$/gm;
const LONE_BRACKET_LINE_PATTERN = /^\s*[\[\]]\s*$/gm;
const ESCAPED_MARKDOWN_PATTERN = /\\([()[\]])/g;
const FOOTNOTE_BACKREF_PATTERN = /\s*↩\s*/g;
const FOOTNOTE_REF_PATTERN = /\[\d+\]/g;
const MULTIPLE_NEWLINES_PATTERN = /\n{3,}/g;
const HTML_BREAK_TAG_PATTERN = /<\s*br\s*\/?>/gi;
const HTML_TABLE_SECTION_TAG_PATTERN = /<\s*\/?\s*(?:table|thead|tbody|tfoot|caption|colgroup|col)\b[^>]*>/gi;
const HTML_TABLE_ROW_TAG_PATTERN = /<\s*\/?\s*tr\b[^>]*>/gi;
const HTML_TABLE_CELL_TAG_PATTERN = /<\s*\/?\s*(?:td|th)\b[^>]*>/gi;
const HTML_BLOCK_TAG_PATTERN =
  /<\s*\/?\s*(?:address|article|aside|blockquote|details|div|dl|dt|dd|figure|figcaption|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|summary|ul)\b[^>]*>/gi;
const RAW_HTML_TAG_PATTERN = /<\/?[A-Za-z][^>\n]*>/g;
const MARKDOWN_TABLE_SEPARATOR_LINE_PATTERN = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/gm;
const MARKDOWN_TABLE_ROW_PATTERN = /^\s*\|(.+?)\|\s*$/gm;
const LEADING_METADATA_DATE_PATTERNS = [
  /^(?:written on\s+)?[A-Za-z]+\s+\d{1,2},\s+\d{4}$/i,
  /^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?z$/i,
  /^\d{1,2}\/\d{1,2}\/\d{4}(?:\s+[A-Za-z].*)?$/,
  /^\d{1,2}(?:st|nd|rd|th)\s+[A-Za-z]+\s+\d{4}$/i,
  /^(?:updated\s+)?[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4},\s+\d{1,2}:\d{2}\s*(?:am|pm)\s*(?:[A-Z]{1,4})?$/i,
  /^[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4},\s+\d{1,2}:\d{2}\s*(?:am|pm)\s*(?:[A-Z]{1,4})?$/i,
  /^\d+[hm]$/i,
  /^\d+\s+(?:minutes?|hours?|days?|weeks?)\s+ago$/i
];
const LEADING_METADATA_PATTERNS = [
  /^(?:by|written by)\b/i,
  /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4}\s+for\s+.+$/,
  /^[A-Z][A-Za-z .'-]+,\s*(?:published|updated)\s*:/i,
  /^[A-Z][A-Za-z .'-]+\s+is\s+(?:a|an)\s+(?:senior|staff|principal|contributing|associate|deputy|executive)\b/i,
  /^(?:published|updated|published by|published on):?$/i,
  /^.+['’]s post$/i
];
const GLOBAL_NOISE_PATTERNS = [
  /^share$/i,
  /^skip to main content$/i,
  /^read more$/i,
  /^read next$/i,
  /^must watch$/i,
  /^copy as \/ view markdown$/i,
  /^explore content categories$/i,
  /^cookie settings$/i,
  /^toggle caption$/i,
  /^hide caption$/i,
  /^products$/i,
  /^features$/i,
  /^models$/i,
  /^solutions$/i,
  /^resources$/i,
  /^company$/i,
  /^help and security$/i,
  /^terms and policies$/i,
  /^about$/i,
  /^developers$/i,
  /^careers$/i,
  /^privacy$/i,
  /^cookies$/i,
  /^terms$/i,
  /^help center$/i,
  /^write$/i,
  /^learn$/i,
  /^code$/i,
  /^more$/i,
  /^english\s*\([^)]+\)$/i,
  /^how it works$/i,
  /^who should apply:?$/i,
  /^meet claude$/i,
  /^login$/i,
  /^published by:?$/i,
  /^published on:?$/i,
  /^updated:?$/i,
  /^\d+\s+min(?:ute)?s?\s+read$/i,
  /^this entry was tagged\b/i,
  /^see more comments$/i,
  /^related content$/i
];
const CAPTION_PATTERNS = [
  /\b(?:getty images|associated press|ap photo|reuters|image source)\b/i,
  /\bhide caption\b/i,
  /\btoggle caption\b/i,
  /^image:\s+/i,
  /^\(?photo by\b/i,
  /\(\s*photo by\b/i,
  /^\(?image ©/i,
  /\/ap$/i
];
const LEGAL_FOOTER_PATTERNS = [
  /all rights reserved/i,
  /cookie policy/i,
  /privacy policy/i,
  /terms of (?:use|service)/i,
  /legal, business, investment, or tax advice/i,
  /unsubscribe immediately/i,
  /you(?:'|’)re receiving this newsletter/i,
  /^©\s*\d{4}\s+meta$/i
];
const PROMO_FOOTER_PATTERNS = [
  /^posted\b.+\bby\b.+\bin\b.+$/i,
  /^aboutdeveloperscareersprivacycookiestermshelp center$/i,
  /^english\s+\(us\).*more languages$/i,
  /\bexplore the full \d{4} list of\b/i,
  /\bapply today\b/i,
  /\bthis story is available exclusively to business insider subscribers\b/i,
  /\bbecome an insider\b/i,
  /\bhave an account\??\b/i
];
const SHARE_OR_COMMENT_PATTERNS = [/^share$/i, /^read more$/i, /^must watch$/i, /^see more comments$/i, /^related content$/i];
const LANGUAGE_FOOTER_PATTERNS = [/^english\s*\([^)]+\)$/i, /^more languages$/i, /^english\s+\(us\).*more languages$/i];

const MIN_NARRATION_TEXT_LENGTH = 160;
export const lowSignalExtractionMessage =
  "This page didn't contain enough article text after removing navigation, login, and promo content.";
export const markdownQualityIssueTypes = [
  "residual_url",
  "leading_metadata",
  "image_wrapper",
  "footer_legal",
  "share_or_comment_noise",
  "language_footer",
  "low_signal_after_cleanup"
] as const;

export type MarkdownQualityIssueType = (typeof markdownQualityIssueTypes)[number];

export interface MarkdownQualityIssue {
  type: MarkdownQualityIssueType;
  excerpt: string;
  lineNumber: number | null;
  message: string;
}

export interface MarkdownQualityAnalysis {
  cleanedMarkdown: string;
  narrationText: string;
  hasNarratableText: boolean;
  issues: MarkdownQualityIssue[];
  issueCounts: Record<MarkdownQualityIssueType, number>;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : " ";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : " ";
    });
}

function normalizeMarkdownTableRows(input: string): string {
  return input
    .replace(MARKDOWN_TABLE_SEPARATOR_LINE_PATTERN, "")
    .replace(MARKDOWN_TABLE_ROW_PATTERN, (_match, row: string) =>
      row
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join("\n")
    );
}

function stripRawHtmlArtifacts(input: string): string {
  const normalized = input
    .replace(HTML_BREAK_TAG_PATTERN, "\n")
    .replace(HTML_TABLE_SECTION_TAG_PATTERN, "\n\n")
    .replace(HTML_TABLE_ROW_TAG_PATTERN, "\n")
    .replace(HTML_TABLE_CELL_TAG_PATTERN, "\n")
    .replace(HTML_BLOCK_TAG_PATTERN, "\n")
    .replace(RAW_HTML_TAG_PATTERN, " ");

  return decodeHtmlEntities(normalized).replace(RAW_HTML_TAG_PATTERN, " ");
}

function normalizeUnicodeArtifacts(input: string): string {
  return input
    .replace(/\u2192/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/\u2194/g, "<->")
    .replace(/\u21d2/g, "=>")
    .replace(/\u21d0/g, "<=")
    .replace(/\u21d4/g, "<=>")
    .replace(/\u2022/g, "-")
    .replace(/\u00b7/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\u200b/g, "")
    .replace(/\uFEFF/g, "");
}

function normalizeTransport(markdown: string): string {
  return normalizeMarkdownTableRows(stripRawHtmlArtifacts(normalizeUnicodeArtifacts(markdown)))
    .replace(/\r\n/g, "\n")
    .replace(IMAGE_LINK_PATTERN, "\n")
    .replace(IMAGE_PATTERN, "\n")
    .replace(EMPTY_LINK_PATTERN, " ")
    .replace(LINK_PATTERN, (_match, label: string) => (label.trim() ? label : " "))
    .replace(DANGLING_LINK_LINE_PATTERN, "")
    .replace(EMPTY_LINK_LINE_PATTERN, "")
    .replace(LONE_BRACKET_LINE_PATTERN, "")
    .replace(ESCAPED_MARKDOWN_PATTERN, "$1")
    .replace(FOOTNOTE_BACKREF_PATTERN, " ")
    .replace(FOOTNOTE_REF_PATTERN, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(MULTIPLE_NEWLINES_PATTERN, "\n\n")
    .trim();
}

function normalizeParagraphMarkdown(paragraph: string): string {
  return paragraph
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/g)
    .map((paragraph) => normalizeParagraphMarkdown(paragraph))
    .filter(Boolean);
}

function regexMatches(pattern: RegExp, input: string): boolean {
  const flags = pattern.flags.replace(/g/g, "");
  return new RegExp(pattern.source, flags).test(input);
}

function paragraphToPlainText(paragraph: string): string {
  return paragraph
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+[.)]\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(input: string): number {
  if (!input) {
    return 0;
  }
  return input.split(/\s+/g).filter(Boolean).length;
}

function alphaCharCount(input: string): number {
  const matches = input.match(/[A-Za-z]/g);
  return matches ? matches.length : 0;
}

function isTitleCaseName(input: string): boolean {
  const words = input.split(/\s+/g).filter(Boolean);
  if (words.length < 2 || words.length > 5) {
    return false;
  }
  return words.every((word) => /^[A-Z][A-Za-z.'-]*$/.test(word));
}

function isMarkdownHeading(paragraph: string): boolean {
  return /^#{1,6}\s+/.test(paragraph.trim());
}

function isCategoryBar(input: string): boolean {
  if (!input.includes("|")) {
    return false;
  }
  const segments = input
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 3) {
    return false;
  }
  return segments.every((segment) => wordCount(segment) <= 4 && !/[.!?]/.test(segment));
}

function isShortTagListParagraph(paragraph: string): boolean {
  const lines = paragraph
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 3 || !lines.every((line) => /^[-*+]\s+/.test(line))) {
    return false;
  }

  return lines.every((line) => {
    const plain = paragraphToPlainText(line);
    return wordCount(plain) >= 1 && wordCount(plain) <= 4 && !/[.!?]/.test(plain) && !/\d/.test(plain);
  });
}

function isLikelyTransportNoise(input: string): boolean {
  if (!input) {
    return true;
  }

  if (/^https?:\/\//i.test(input) || /^www\./i.test(input)) {
    return true;
  }

  if (input.includes("http") || /\b[a-z0-9.-]+\.(?:com|org|net|co|io|gov|edu|uk|us|ai|tv)\b/i.test(input)) {
    const alphaRatio = alphaCharCount(input) / Math.max(input.length, 1);
    return alphaRatio < 0.45;
  }

  return false;
}

function isFooterLegalNoise(input: string): boolean {
  if (!input) {
    return false;
  }

  if (LEGAL_FOOTER_PATTERNS.some((pattern) => pattern.test(input))) {
    return true;
  }

  const keywordPatterns = [/\bprivacy\b/i, /\bcookies?\b/i, /\bterms\b/i, /\bhelp center\b/i, /\bdevelopers\b/i, /\bcareers\b/i, /\babout\b/i];
  const matchCount = keywordPatterns.filter((pattern) => pattern.test(input)).length;
  if (matchCount < 2) {
    return false;
  }

  return wordCount(input) <= 18 || isCategoryBar(input) || !/[.!?]/.test(input);
}

function isLeadingMetadata(input: string, index: number, paragraph: string): boolean {
  if (index > 5) {
    return false;
  }

  if (LEADING_METADATA_DATE_PATTERNS.some((pattern) => pattern.test(input))) {
    return true;
  }

  if (LEADING_METADATA_PATTERNS.some((pattern) => pattern.test(input))) {
    return true;
  }

  if (index <= 3 && !isMarkdownHeading(paragraph) && isTitleCaseName(input)) {
    return true;
  }

  if (index <= 3 && /^\d{1,2}\/\d{1,2}\/\d{4}\s+[A-Za-z].+$/i.test(input) && wordCount(input) <= 8) {
    return true;
  }

  return false;
}

function isCaptionNoise(input: string, index: number): boolean {
  if (CAPTION_PATTERNS.some((pattern) => pattern.test(input))) {
    return wordCount(input) <= 20 || index <= 6;
  }

  return false;
}

function isLikelyLeadingCaption(paragraph: string, nextParagraph: string): boolean {
  if (!paragraph || !nextParagraph || isMarkdownHeading(paragraph)) {
    return false;
  }

  const plain = paragraphToPlainText(paragraph);
  const nextPlain = paragraphToPlainText(nextParagraph);
  const words = wordCount(plain);
  const nextWords = wordCount(nextPlain);
  if (words < 5 || words > 32 || nextWords < 18) {
    return false;
  }

  if (/[.!?]["']?$/.test(plain)) {
    return false;
  }

  if (isLeadingMetadata(plain, 0, paragraph) || isGlobalNoise(plain) || isCaptionNoise(plain, 0)) {
    return false;
  }

  return true;
}

function isLikelyLeadingStandfirst(paragraph: string, index: number, nextParagraph: string, nextNextParagraph: string): boolean {
  if (index > 2 || !paragraph || isMarkdownHeading(paragraph)) {
    return false;
  }

  const plain = paragraphToPlainText(paragraph);
  const words = wordCount(plain);
  if (words < 6 || words > 28 || /[!?]$/.test(plain)) {
    return false;
  }

  const nextPlain = paragraphToPlainText(nextParagraph);
  const nextNextPlain = paragraphToPlainText(nextNextParagraph);
  return (
    isLeadingMetadata(nextPlain, index + 1, nextParagraph) ||
    isLeadingMetadata(nextNextPlain, index + 2, nextNextParagraph) ||
    isCaptionNoise(nextPlain, index + 1)
  );
}

function isGlobalNoise(input: string): boolean {
  if (!input) {
    return true;
  }

  if (GLOBAL_NOISE_PATTERNS.some((pattern) => pattern.test(input))) {
    return true;
  }

  if (isFooterLegalNoise(input)) {
    return true;
  }

  if (PROMO_FOOTER_PATTERNS.some((pattern) => pattern.test(input))) {
    return true;
  }

  if (isCategoryBar(input)) {
    return true;
  }

  if (isLikelyTransportNoise(input) && wordCount(input) <= 18) {
    return true;
  }

  if (input.startsWith("![") || input.startsWith("[](") || input.startsWith("](")) {
    return true;
  }

  return false;
}

function isNoiseParagraph(paragraph: string): boolean {
  return isGlobalNoise(paragraphToPlainText(paragraph)) || isShortTagListParagraph(paragraph);
}

function trimLeadingNoise(paragraphs: string[]): string[] {
  let start = 0;
  let removedCaptionSignal = false;
  while (start < paragraphs.length) {
    const plain = paragraphToPlainText(paragraphs[start] ?? "");
    if (isLikelyLeadingStandfirst(paragraphs[start] ?? "", start, paragraphs[start + 1] ?? "", paragraphs[start + 2] ?? "")) {
      start += 1;
      continue;
    }
    if (isLeadingMetadata(plain, start, paragraphs[start] ?? "")) {
      start += 1;
      continue;
    }
    if (isCaptionNoise(plain, start)) {
      removedCaptionSignal = true;
      start += 1;
      continue;
    }
    if (isNoiseParagraph(paragraphs[start] ?? "")) {
      start += 1;
      continue;
    }
    break;
  }

  if (removedCaptionSignal && isLikelyLeadingCaption(paragraphs[start] ?? "", paragraphs[start + 1] ?? "")) {
    start += 1;
  }

  return paragraphs.slice(start);
}

function trimTrailingNoise(paragraphs: string[]): string[] {
  let end = paragraphs.length;
  while (end > 0) {
    const plain = paragraphToPlainText(paragraphs[end - 1] ?? "");
    if (isNoiseParagraph(paragraphs[end - 1] ?? "") || isCaptionNoise(plain, end - 1)) {
      end -= 1;
      continue;
    }
    break;
  }

  for (let index = Math.max(0, end - 8); index < end; index += 1) {
    const plain = paragraphToPlainText(paragraphs[index] ?? "");
    if (/^related content$/i.test(plain) || /^must watch$/i.test(plain) || /^cookie settings$/i.test(plain)) {
      end = index;
      break;
    }
  }

  return paragraphs.slice(0, end);
}

export function cleanExtractedMarkdown(markdown: string): string {
  const normalized = normalizeTransport(markdown);
  if (!normalized) {
    return "";
  }

  const paragraphs = splitParagraphs(normalized).filter((paragraph) => {
    return !isNoiseParagraph(paragraph);
  });

  let trimmed = trimTrailingNoise(trimLeadingNoise(paragraphs)).filter((paragraph, index) => {
    const plain = paragraphToPlainText(paragraph);
    return !isCaptionNoise(plain, index);
  });

  const hadLeadingMetadataOrCaption = paragraphs.slice(0, Math.min(4, paragraphs.length)).some((paragraph, index) => {
    const plain = paragraphToPlainText(paragraph);
    return isLeadingMetadata(plain, index, paragraph) || isCaptionNoise(plain, index);
  });

  if (hadLeadingMetadataOrCaption && isLikelyLeadingCaption(trimmed[0] ?? "", trimmed[1] ?? "")) {
    trimmed = trimmed.slice(1);
  }

  return trimmed.join("\n\n").replace(MULTIPLE_NEWLINES_PATTERN, "\n\n").trim();
}

export function markdownToNarrationText(markdown: string): string {
  return normalizeMarkdownTableRows(stripRawHtmlArtifacts(normalizeTransport(markdown)))
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+[.)]\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/[*_~]/g, "")
    .replace(FOOTNOTE_REF_PATTERN, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(MULTIPLE_NEWLINES_PATTERN, "\n\n")
    .trim();
}

export function hasNarratableText(markdownText: string, minChars = MIN_NARRATION_TEXT_LENGTH): boolean {
  return markdownText.replace(/\s+/g, " ").trim().length >= minChars;
}

export const narrationTextMinChars = MIN_NARRATION_TEXT_LENGTH;

function emptyIssueCounts(): Record<MarkdownQualityIssueType, number> {
  return Object.fromEntries(markdownQualityIssueTypes.map((type) => [type, 0])) as Record<MarkdownQualityIssueType, number>;
}

function lineNumberForExcerpt(markdown: string, excerpt: string): number | null {
  const firstLine = excerpt
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) {
    return null;
  }

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const index = lines.findIndex((line) => line.includes(firstLine));
  return index >= 0 ? index + 1 : null;
}

function pushIssue(
  issues: MarkdownQualityIssue[],
  counts: Record<MarkdownQualityIssueType, number>,
  markdown: string,
  type: MarkdownQualityIssueType,
  excerpt: string,
  message: string
): void {
  counts[type] += 1;
  if (issues.some((issue) => issue.type === type && issue.excerpt === excerpt)) {
    return;
  }
  issues.push({
    type,
    excerpt,
    lineNumber: lineNumberForExcerpt(markdown, excerpt),
    message
  });
}

function analyzeRawMarkdownIssues(markdown: string): Array<{
  type: Exclude<MarkdownQualityIssueType, "low_signal_after_cleanup">;
  excerpt: string;
  message: string;
}> {
  const issues: Array<{
    type: Exclude<MarkdownQualityIssueType, "low_signal_after_cleanup">;
    excerpt: string;
    message: string;
  }> = [];
  const rawLines = markdown.replace(/\r\n/g, "\n").split("\n");
  const normalized = normalizeTransport(markdown);
  const transportParagraphs = normalized ? splitParagraphs(normalized) : [];
  const rawParagraphs = splitParagraphs(markdown.replace(/\r\n/g, "\n"));

  const residualUrlLine = rawLines.find((line) => /https?:\/\/|www\./i.test(line.trim()));
  if (residualUrlLine) {
    issues.push({
      type: "residual_url",
      excerpt: residualUrlLine.trim(),
      message: "Contains a raw URL or host-like string in extracted markdown."
    });
  }

  const imageWrapperParagraph = rawParagraphs.find((paragraph) => {
    const singleLine = paragraph.replace(/\n/g, " ");
    return (
      regexMatches(IMAGE_LINK_PATTERN, singleLine) ||
      regexMatches(IMAGE_PATTERN, singleLine) ||
      regexMatches(EMPTY_LINK_PATTERN, singleLine) ||
      regexMatches(EMPTY_LINK_LINE_PATTERN, singleLine) ||
      regexMatches(DANGLING_LINK_LINE_PATTERN, singleLine) ||
      /^\s*!\[/.test(singleLine)
    );
  });
  if (imageWrapperParagraph) {
    issues.push({
      type: "image_wrapper",
      excerpt: imageWrapperParagraph,
      message: "Contains markdown image/link scaffolding that should be removed before persistence."
    });
  }

  for (let index = 0; index < Math.min(6, transportParagraphs.length); index += 1) {
    const paragraph = transportParagraphs[index] ?? "";
    const plain = paragraphToPlainText(paragraph);
    if (isLeadingMetadata(plain, index, paragraph)) {
      issues.push({
        type: "leading_metadata",
        excerpt: paragraph,
        message: "Contains leading metadata or byline chrome before the article body."
      });
      break;
    }
  }

  const footerLegalParagraph = transportParagraphs.find((paragraph) => {
    const plain = paragraphToPlainText(paragraph);
    return isFooterLegalNoise(plain);
  });
  if (footerLegalParagraph) {
    issues.push({
      type: "footer_legal",
      excerpt: footerLegalParagraph,
      message: "Contains legal or footer chrome that should not remain in extracted markdown."
    });
  }

  const shareOrCommentParagraph = transportParagraphs.find((paragraph) => {
    const plain = paragraphToPlainText(paragraph);
    return SHARE_OR_COMMENT_PATTERNS.some((pattern) => pattern.test(plain));
  });
  if (shareOrCommentParagraph) {
    issues.push({
      type: "share_or_comment_noise",
      excerpt: shareOrCommentParagraph,
      message: "Contains share, promo, or comment noise."
    });
  }

  const languageFooterParagraph = transportParagraphs.find((paragraph) => {
    const plain = paragraphToPlainText(paragraph);
    return LANGUAGE_FOOTER_PATTERNS.some((pattern) => pattern.test(plain));
  });
  if (languageFooterParagraph) {
    issues.push({
      type: "language_footer",
      excerpt: languageFooterParagraph,
      message: "Contains language-selector or footer localization chrome."
    });
  }

  return issues;
}

export function analyzeMarkdownQuality(markdown: string): MarkdownQualityAnalysis {
  const cleanedMarkdown = cleanExtractedMarkdown(markdown);
  const narrationText = markdownToNarrationText(cleanedMarkdown);
  const narratable = hasNarratableText(narrationText);
  const issues: MarkdownQualityIssue[] = [];
  const issueCounts = emptyIssueCounts();

  for (const issue of analyzeRawMarkdownIssues(markdown)) {
    pushIssue(issues, issueCounts, markdown, issue.type, issue.excerpt, issue.message);
  }

  if (!narratable) {
    pushIssue(
      issues,
      issueCounts,
      cleanedMarkdown || markdown,
      "low_signal_after_cleanup",
      cleanedMarkdown || "(empty after cleanup)",
      lowSignalExtractionMessage
    );
  }

  return {
    cleanedMarkdown,
    narrationText,
    hasNarratableText: narratable,
    issues,
    issueCounts
  };
}
