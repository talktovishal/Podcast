import { AppError, errorCodes } from "../errors/codes";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { BRAND_BOT_USER_AGENT, BRAND_SNAPSHOT_FALLBACK_URL } from "../config/brand";
import { extractNarrationTextFromHtml, resolveTitleFromHtmlWithAbogenFallback } from "./abogen/htmlToText";
import https from "node:https";
import http from "node:http";

const FETCH_TIMEOUT_MS = 30_000;

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

function htmlToMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-"
  });
  turndown.keep(["table", "thead", "tbody", "tr", "th", "td"]);
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

function extractFromHtml(input: {
  html: string;
  sourceUrl: string;
}): { title: string; byline: string | null; text: string; markdown: string; rawHtml: string } {
  const extracted = extractReadableWithAbogenCleanup(input.html, input.sourceUrl);
  const text = normalizeExtracted(extracted.text);
  const markdown = extracted.markdown && extracted.markdown.length >= 40 ? extracted.markdown : normalizeExtracted(text);
  if (text.length < 160) {
    throw new AppError(errorCodes.EXTRACTION_EMPTY, "Extracted text is too short to narrate.", 400);
  }

  return {
    title: extracted.title || "Untitled",
    byline: extracted.byline,
    text,
    markdown,
    rawHtml: input.html
  };
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

/**
 * Fetch a URL while pinning the TCP connection to a pre-resolved IP address.
 * This closes the TOCTOU DNS-rebinding window between validation and fetch.
 */
function fetchWithPinnedIp(urlStr: string, resolvedIp: string, timeoutMs: number): Promise<{ status: number; ok: boolean; text: () => Promise<string> }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const isHttps = parsedUrl.protocol === "https:";
    const family: 4 | 6 = resolvedIp.includes(":") ? 6 : 4;
    const mod = isHttps ? https : http;
    const port = parsedUrl.port ? Number(parsedUrl.port) : (isHttps ? 443 : 80);
    const agent = new mod.Agent({
      lookup: (_hostname: string, _options: unknown, callback: (err: Error | null, address: string, family: number) => void) => {
        callback(null, resolvedIp, family);
      }
    } as ConstructorParameters<typeof https.Agent>[0]);

    const timer = setTimeout(() => {
      req.destroy(Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }));
    }, timeoutMs);

    const req = mod.request(
      {
        hostname: parsedUrl.hostname,
        port,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: "GET",
        headers: { "user-agent": BRAND_BOT_USER_AGENT, host: parsedUrl.host },
        agent
      },
      (res) => {
        clearTimeout(timer);
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 200;
          resolve({ status, ok: status >= 200 && status < 300, text: () => Promise.resolve(body) });
        });
        res.on("error", reject);
      }
    );
    req.on("error", (err) => { clearTimeout(timer); reject(err); });
    req.end();
  });
}

export async function extractHtmlFromUrl(url: string, resolvedIp?: string): Promise<{
  title: string;
  text: string;
  markdown: string;
  rawHtml: string;
  byline?: string | null;
}> {
  let response: { status: number; ok: boolean; text: () => Promise<string> };
  try {
    if (resolvedIp) {
      response = await fetchWithPinnedIp(url, resolvedIp, FETCH_TIMEOUT_MS);
    } else {
      const r = await fetch(url, {
        method: "GET",
        headers: { "user-agent": BRAND_BOT_USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
      response = { status: r.status, ok: r.ok, text: () => r.text() };
    }
  } catch (error) {
    throw mapNetworkErrorToAppError(error);
  }

  if (!response.ok) {
    throw mapFetchStatusToAppError(response.status);
  }

  const html = await response.text();
  try {
    return extractFromHtml({ html, sourceUrl: url });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(errorCodes.EXTRACTION_EMPTY, "Could not extract readable content from this URL.", 400);
  }
}

export function extractHtmlSnapshot(input: {
  html: string;
  url?: string;
}): { title: string; text: string; markdown: string; rawHtml: string; byline?: string | null } {
  try {
    return extractFromHtml({
      html: input.html,
      sourceUrl: input.url || BRAND_SNAPSHOT_FALLBACK_URL
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(errorCodes.EXTRACTION_EMPTY, "Could not extract readable content from this page snapshot.", 400);
  }
}
