import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { ExtractedArticle } from "./types";

function extractHeadings(doc: Document): string[] {
  const nodes = Array.from(doc.querySelectorAll("h1, h2, h3"));
  return nodes
    .map((node) => node.textContent?.trim() || "")
    .filter(Boolean);
}

export function extractReadable(
  html: string,
  meta: Omit<ExtractedArticle, "html" | "text" | "headings" | "linkCount" | "hasCodeBlocks">
): ExtractedArticle {
  const dom = new JSDOM(html, { url: meta.canonicalUrl });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) {
    throw new Error("Readability failed to extract article");
  }

  const doc = new JSDOM(article.content || "").window.document;
  doc.querySelectorAll("figcaption, [class*='caption'], [data-testid*='caption']").forEach((node) => node.remove());
  const headings = extractHeadings(doc);
  const linkCount = doc.querySelectorAll("a").length;
  const hasCodeBlocks = doc.querySelectorAll("pre, code").length > 0;
  const cleanedText = (doc.body?.textContent || article.textContent || "").trim();

  return {
    ...meta,
    title: article.title?.trim() || meta.title,
    author: article.byline?.trim() || meta.author,
    html,
    text: cleanedText,
    headings,
    linkCount,
    hasCodeBlocks,
  };
}
