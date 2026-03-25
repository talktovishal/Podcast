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
const LEADING_METADATA_DATE_PATTERNS = [
  /^(?:written on\s+)?[A-Za-z]+\s+\d{1,2},\s+\d{4}$/i,
  /^\d{1,2}\/\d{1,2}\/\d{4}(?:\s+[A-Za-z].*)?$/,
  /^\d{1,2}(?:st|nd|rd|th)\s+[A-Za-z]+\s+\d{4}$/i,
  /^\d+[hm]$/i,
  /^\d+\s+(?:minutes?|hours?|days?|weeks?)\s+ago$/i
];
const LEADING_METADATA_PATTERNS = [
  /^(?:by|written by)\b/i,
  /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4}\s+for\s+.+$/,
  /^[A-Z][A-Za-z .'-]+,\s*(?:published|updated)\s*:/i,
  /^(?:published|updated|published by|published on):?$/i,
  /^.+['’]s post$/i
];
const GLOBAL_NOISE_PATTERNS = [
  /^share$/i,
  /^read more$/i,
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
  /^this entry was tagged\b/i,
  /^see more comments$/i,
  /^related content$/i
];
const CAPTION_PATTERNS = [
  /\b(?:getty images|associated press|ap photo|reuters|image source)\b/i,
  /\bhide caption\b/i,
  /\btoggle caption\b/i,
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
  /\bapply today\b/i
];

const MIN_NARRATION_TEXT_LENGTH = 160;
export const lowSignalExtractionMessage =
  "This page didn't contain enough article text after removing navigation, login, and promo content.";

function normalizeTransport(markdown: string): string {
  return markdown
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

function isGlobalNoise(input: string): boolean {
  if (!input) {
    return true;
  }

  if (GLOBAL_NOISE_PATTERNS.some((pattern) => pattern.test(input))) {
    return true;
  }

  if (LEGAL_FOOTER_PATTERNS.some((pattern) => pattern.test(input))) {
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

function trimLeadingNoise(paragraphs: string[]): string[] {
  let start = 0;
  while (start < paragraphs.length) {
    const plain = paragraphToPlainText(paragraphs[start] ?? "");
    if (isLeadingMetadata(plain, start, paragraphs[start] ?? "") || isCaptionNoise(plain, start) || isGlobalNoise(plain)) {
      start += 1;
      continue;
    }
    break;
  }
  return paragraphs.slice(start);
}

function trimTrailingNoise(paragraphs: string[]): string[] {
  let end = paragraphs.length;
  while (end > 0) {
    const plain = paragraphToPlainText(paragraphs[end - 1] ?? "");
    if (isGlobalNoise(plain) || isCaptionNoise(plain, end - 1)) {
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

  const paragraphs = normalized
    .split(/\n{2,}/g)
    .map((paragraph) => normalizeParagraphMarkdown(paragraph))
    .filter(Boolean)
    .filter((paragraph, index) => {
      const plain = paragraphToPlainText(paragraph);
      return !isCaptionNoise(plain, index) && !isGlobalNoise(plain);
    });

  const trimmed = trimTrailingNoise(trimLeadingNoise(paragraphs));
  return trimmed.join("\n\n").replace(MULTIPLE_NEWLINES_PATTERN, "\n\n").trim();
}

export function markdownToNarrationText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
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
