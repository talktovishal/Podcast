import { cleanTextWithAbogenRules } from "./cleanText";

const BRACKETED_NUMBERS_PATTERN = /\[\s*\d+\s*\]/g;
const STANDALONE_PAGE_NUMBERS_PATTERN = /^\s*\d+\s*$/gm;
const PAGE_NUMBERS_AT_END_PATTERN = /\s+\d+\s*$/gm;
const PAGE_NUMBERS_WITH_DASH_PATTERN = /\s+[-–—]\s*\d+\s*[-–—]?\s*$/gm;

export function cleanPdfTextWithAbogenRules(text: string): string {
  let cleaned = cleanTextWithAbogenRules(text, { replaceSingleNewlines: false });
  cleaned = cleaned.replace(BRACKETED_NUMBERS_PATTERN, "");
  cleaned = cleaned.replace(STANDALONE_PAGE_NUMBERS_PATTERN, "");
  cleaned = cleaned.replace(PAGE_NUMBERS_AT_END_PATTERN, "");
  cleaned = cleaned.replace(PAGE_NUMBERS_WITH_DASH_PATTERN, "");
  return cleanTextWithAbogenRules(cleaned);
}
