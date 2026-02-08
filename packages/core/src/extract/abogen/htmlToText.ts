import { JSDOM } from "jsdom";
import { cleanTextWithAbogenRules } from "./cleanText";

const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "sup",
  "sub",
  "figure",
  "figcaption",
  "[class*='caption']",
  "[data-testid*='caption']"
];

const BLOCK_SELECTORS = "p, div, section, article, blockquote, li";

function removeNoise(document: Document): void {
  for (const selector of NOISE_SELECTORS) {
    for (const node of Array.from(document.querySelectorAll(selector))) {
      node.remove();
    }
  }
}

function prefixOrderedListItems(document: Document): void {
  for (const list of Array.from(document.querySelectorAll("ol"))) {
    const startAttr = list.getAttribute("start");
    const parsed = startAttr ? Number.parseInt(startAttr, 10) : 1;
    const start = Number.isNaN(parsed) ? 1 : parsed;

    const items = Array.from(list.querySelectorAll(":scope > li"));
    items.forEach((item, index) => {
      const prefix = `${start + index}) `;
      const firstText = item.firstChild;

      if (firstText && firstText.nodeType === item.ownerDocument.TEXT_NODE) {
        firstText.textContent = `${prefix}${firstText.textContent ?? ""}`;
      } else {
        item.insertBefore(item.ownerDocument.createTextNode(prefix), item.firstChild);
      }
    });
  }
}

function appendParagraphBreaks(document: Document): void {
  for (const node of Array.from(document.querySelectorAll(BLOCK_SELECTORS))) {
    if ((node.textContent || "").trim()) {
      node.append("\n\n");
    }
  }
}

export function extractNarrationTextFromHtml(html: string): string {
  const dom = new JSDOM(`<body>${html}</body>`);
  try {
    const document = dom.window.document;
    removeNoise(document);
    prefixOrderedListItems(document);
    appendParagraphBreaks(document);

    return cleanTextWithAbogenRules(document.body?.textContent || "");
  } finally {
    dom.window.close();
  }
}

export function resolveTitleFromHtmlWithAbogenFallback(html: string, fallback: string): string {
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    const titleNode = document.querySelector("title");
    const title = titleNode?.textContent?.trim();
    if (title) {
      return title;
    }

    for (const tag of ["h1", "h2", "h3"]) {
      const heading = document.querySelector(tag);
      const value = heading?.textContent?.trim();
      if (value) {
        return value;
      }
    }

    return fallback;
  } finally {
    dom.window.close();
  }
}
