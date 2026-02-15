import { AppError, errorCodes } from "../errors/codes";
import { cleanPdfTextWithAbogenRules } from "./abogen/pdfClean";

async function loadPdfjs() {
  const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return mod;
}

function normalizeExtracted(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function textToMarkdown(text: string, fallbackTitle: string | null): string {
  const paragraphs = text
    .split(/\n{2,}/g)
    .map((value) => value.trim())
    .filter(Boolean);

  const markdownParts: string[] = [];
  if (fallbackTitle?.trim()) {
    markdownParts.push(`# ${fallbackTitle.trim()}`);
  }

  for (const paragraph of paragraphs) {
    const singleLine = paragraph.replace(/\n+/g, " ").trim();
    if (!singleLine) {
      continue;
    }

    // Heuristic: short all-caps or title-case lines become headings.
    const isShort = singleLine.length <= 90;
    const isAllCaps = singleLine === singleLine.toUpperCase() && /[A-Z]/.test(singleLine);
    const isLikelyHeading = isShort && (isAllCaps || /^[A-Z][\w\s,:-]{3,}$/.test(singleLine));
    if (isLikelyHeading && !singleLine.startsWith("-") && !/^\d+[.)]/.test(singleLine)) {
      markdownParts.push(`## ${singleLine}`);
      continue;
    }

    markdownParts.push(singleLine);
  }

  return markdownParts.join("\n\n").trim();
}

function normalizePdfTitle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\u0000/g, "").trim();
  if (!normalized || normalized.toLowerCase() === "untitled") {
    return null;
  }

  return normalized;
}

async function extractPdfTitle(doc: { getMetadata: () => Promise<unknown> }): Promise<string | null> {
  try {
    const metadata = (await doc.getMetadata()) as {
      info?: { Title?: unknown };
      metadata?: { get?: (name: string) => unknown };
    };

    const infoTitle = normalizePdfTitle(metadata.info?.Title);
    if (infoTitle) {
      return infoTitle;
    }

    return normalizePdfTitle(metadata.metadata?.get?.("dc:title"));
  } catch {
    return null;
  }
}

export async function extractTextFromPdf(data: Uint8Array): Promise<{
  text: string;
  markdown: string;
  pages: number;
  title: string | null;
}> {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  const extractedTitle = await extractPdfTitle(doc);

  const pages: string[] = [];
  for (let page = 1; page <= doc.numPages; page += 1) {
    const pageDoc = await doc.getPage(page);
    const content = await pageDoc.getTextContent();
    const lineFragments = (content.items as Array<{ str?: string }>)
      .map((item) => item.str || "")
      .filter((value) => value.trim().length > 0);
    const cleanedPage = cleanPdfTextWithAbogenRules(lineFragments.join("\n"));
    if (cleanedPage) {
      pages.push(cleanedPage);
    }
  }

  const text = normalizeExtracted(pages.join("\n\n"));
  if (text.length < 120) {
    throw new AppError(
      errorCodes.PDF_OCR_NOT_SUPPORTED,
      "This PDF appears scanned or image-heavy. OCR is not supported yet.",
      400
    );
  }

  return {
    text,
    markdown: textToMarkdown(text, extractedTitle),
    pages: doc.numPages,
    title: extractedTitle
  };
}
