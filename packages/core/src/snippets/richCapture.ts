import {
  SNIPPET_DERIVED_MARKDOWN_MAX_CHARS,
  type SnippetPageMetadata
} from "../types/domain";
import { htmlToMarkdown } from "../extract/html";

export type RichSnippetCapture = {
  selectedHtml: string | null;
  selectionMarkdown: string | null;
  contextMarkdown: string | null;
  captureMarkdown: string | null;
  pageMetadata: SnippetPageMetadata | null;
};

type BuildRichSnippetCaptureInput = {
  sourceUrl: string;
  sourceTitle?: string | null;
  selectedText: string;
  selectedHtml?: string | null;
  contextHtml?: string | null;
  pageMetadata?: SnippetPageMetadata | null;
};

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function clampMarkdown(markdown: string | null | undefined): string | null {
  const normalized = normalizeText(markdown)?.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, SNIPPET_DERIVED_MARKDOWN_MAX_CHARS).trim() || null;
}

function normalizePageMetadata(metadata: SnippetPageMetadata | null | undefined): SnippetPageMetadata | null {
  if (!metadata) {
    return null;
  }

  const normalized: SnippetPageMetadata = {
    sectionHeadings: Array.isArray(metadata.sectionHeadings)
      ? metadata.sectionHeadings
          .map((value) => normalizeText(value))
          .filter((value): value is string => Boolean(value))
      : []
  };

  const canonicalUrl = normalizeText(metadata.canonicalUrl);
  const siteName = normalizeText(metadata.siteName);
  const description = normalizeText(metadata.description);
  const author = normalizeText(metadata.author);
  const byline = normalizeText(metadata.byline);
  const publishedAt = normalizeText(metadata.publishedAt);
  const language = normalizeText(metadata.language);
  const imageUrl = normalizeText(metadata.imageUrl);

  if (canonicalUrl) {
    normalized.canonicalUrl = canonicalUrl;
  }
  if (siteName) {
    normalized.siteName = siteName;
  }
  if (description) {
    normalized.description = description;
  }
  if (author) {
    normalized.author = author;
  }
  if (byline) {
    normalized.byline = byline;
  }
  if (publishedAt) {
    normalized.publishedAt = publishedAt;
  }
  if (language) {
    normalized.language = language;
  }
  if (imageUrl) {
    normalized.imageUrl = imageUrl;
  }

  const hasContent = Boolean(
    normalized.canonicalUrl ||
      normalized.siteName ||
      normalized.description ||
      normalized.author ||
      normalized.byline ||
      normalized.publishedAt ||
      normalized.language ||
      normalized.imageUrl ||
      normalized.sectionHeadings.length
  );

  return hasContent ? normalized : null;
}

function markdownFromSelection(selectedText: string, selectedHtml: string | null): string | null {
  if (selectedHtml) {
    const markdown = clampMarkdown(htmlToMarkdown(selectedHtml));
    if (markdown) {
      return markdown;
    }
  }
  return clampMarkdown(selectedText);
}

function buildCaptureMarkdown(input: {
  sourceUrl: string;
  sourceTitle: string | null;
  selectionMarkdown: string | null;
  contextMarkdown: string | null;
  pageMetadata: SnippetPageMetadata | null;
}): string | null {
  const lines: string[] = [];
  const title = input.sourceTitle || input.pageMetadata?.siteName || "Saved snippet";
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`Source URL: ${input.pageMetadata?.canonicalUrl || input.sourceUrl}`);

  if (input.pageMetadata?.siteName) {
    lines.push(`Site: ${input.pageMetadata.siteName}`);
  }
  if (input.pageMetadata?.author || input.pageMetadata?.byline) {
    lines.push(`Author: ${input.pageMetadata.author || input.pageMetadata.byline}`);
  }
  if (input.pageMetadata?.publishedAt) {
    lines.push(`Published: ${input.pageMetadata.publishedAt}`);
  }
  if (input.pageMetadata?.language) {
    lines.push(`Language: ${input.pageMetadata.language}`);
  }
  if (input.pageMetadata?.sectionHeadings.length) {
    lines.push(`Section path: ${input.pageMetadata.sectionHeadings.join(" > ")}`);
  }
  if (input.pageMetadata?.description) {
    lines.push("");
    lines.push("## Page description");
    lines.push("");
    lines.push(input.pageMetadata.description);
  }
  if (input.selectionMarkdown) {
    lines.push("");
    lines.push("## Selected passage");
    lines.push("");
    lines.push(input.selectionMarkdown);
  }
  if (input.contextMarkdown && input.contextMarkdown !== input.selectionMarkdown) {
    lines.push("");
    lines.push("## Surrounding context");
    lines.push("");
    lines.push(input.contextMarkdown);
  }

  return clampMarkdown(lines.join("\n"));
}

export function serializeSnippetPageMetadata(metadata: SnippetPageMetadata | null | undefined): string | null {
  const normalized = normalizePageMetadata(metadata);
  if (!normalized) {
    return null;
  }
  return JSON.stringify(normalized);
}

export function parseSnippetPageMetadata(raw: string | null | undefined): SnippetPageMetadata | null {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  try {
    return normalizePageMetadata(JSON.parse(raw) as SnippetPageMetadata);
  } catch {
    return null;
  }
}

export function buildRichSnippetCapture(input: BuildRichSnippetCaptureInput): RichSnippetCapture {
  const pageMetadata = normalizePageMetadata(input.pageMetadata);
  const selectedHtml = normalizeText(input.selectedHtml);
  const selectionMarkdown = markdownFromSelection(input.selectedText, selectedHtml);
  const contextMarkdown = clampMarkdown(input.contextHtml ? htmlToMarkdown(input.contextHtml) : null);

  return {
    selectedHtml,
    selectionMarkdown,
    contextMarkdown,
    captureMarkdown: buildCaptureMarkdown({
      sourceUrl: input.sourceUrl,
      sourceTitle: normalizeText(input.sourceTitle),
      selectionMarkdown,
      contextMarkdown,
      pageMetadata
    }),
    pageMetadata
  };
}
