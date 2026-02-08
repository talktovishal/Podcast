import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { AppError, errorCodes } from "../errors/codes.js";

function normalizeExtracted(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractHtmlFromUrl(url: string): Promise<{ title: string; text: string; byline?: string | null }> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "user-agent": "ListenLaterBot/0.1 (+https://listenlater.local)"
    }
  });

  if (!response.ok) {
    throw new AppError(errorCodes.EXTRACTION_FAILED, `Failed to fetch URL (${response.status}).`, 400);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const parsed = reader.parse();

  if (!parsed?.textContent) {
    throw new AppError(errorCodes.EXTRACTION_EMPTY, "Could not extract readable content from this URL.", 400);
  }

  const text = normalizeExtracted(parsed.textContent);
  if (text.length < 160) {
    throw new AppError(errorCodes.EXTRACTION_EMPTY, "Extracted text is too short to narrate.", 400);
  }

  return {
    title: parsed.title || "Untitled",
    byline: parsed.byline,
    text
  };
}
