import { AppError, errorCodes } from "../errors/codes";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { extractNarrationTextFromHtml, resolveTitleFromHtmlWithAbogenFallback } from "./abogen/htmlToText";

const FETCH_TIMEOUT_MS = 30_000;

function normalizeExtracted(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractReadableWithAbogenCleanup(html: string, sourceUrl: string): { title: string; byline: string | null; text: string } {
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

    return {
      title,
      byline: article.byline?.trim() || null,
      text
    };
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

  if (err.name === "AbortError" || code === "UND_ERR_HEADERS_TIMEOUT" || code === "ETIMEDOUT") {
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

  return new AppError(
    errorCodes.EXTRACTION_FAILED,
    "Could not fetch this URL. Retry once; if it fails again, the site likely blocks automated access.",
    400
  );
}

export async function extractHtmlFromUrl(url: string): Promise<{ title: string; text: string; byline?: string | null }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": "ListenLaterBot/0.1 (+https://listenlater.local)"
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
  } catch (error) {
    throw mapNetworkErrorToAppError(error);
  }

  if (!response.ok) {
    throw mapFetchStatusToAppError(response.status);
  }

  const html = await response.text();
  try {
    const extracted = extractReadableWithAbogenCleanup(html, url);
    const text = normalizeExtracted(extracted.text);
    if (text.length < 160) {
      throw new AppError(errorCodes.EXTRACTION_EMPTY, "Extracted text is too short to narrate.", 400);
    }

    return {
      title: extracted.title || "Untitled",
      byline: extracted.byline,
      text
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(errorCodes.EXTRACTION_EMPTY, "Could not extract readable content from this URL.", 400);
  }
}
