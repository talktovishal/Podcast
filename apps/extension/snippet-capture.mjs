function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value.trim();
  }
}

function firstMetaContent(document, selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const value =
      selector.includes("link[rel='canonical']") || selector.includes('link[rel="canonical"]')
        ? element?.href
        : element?.getAttribute?.("content") || element?.getAttribute?.("datetime") || element?.textContent;
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function isVisible(element, defaultView) {
  if (!(element instanceof defaultView.Element) || !element.isConnected) {
    return false;
  }

  let current = element;
  while (current && current instanceof defaultView.Element) {
    if (current.hidden || current.getAttribute("aria-hidden") === "true") {
      return false;
    }
    const style = defaultView.getComputedStyle ? defaultView.getComputedStyle(current) : null;
    if (style && (style.display === "none" || style.visibility === "hidden")) {
      return false;
    }
    current = current.parentElement;
  }

  return true;
}

function elementFromNode(node, defaultView) {
  if (!node) {
    return null;
  }
  if (node instanceof defaultView.Element) {
    return node;
  }
  return node.parentElement || null;
}

function sanitizeFragment(root, defaultView) {
  if (!(root instanceof defaultView.Element)) {
    return "";
  }

  const clone = root.cloneNode(true);
  if (!(clone instanceof defaultView.Element)) {
    return "";
  }

  const blockedSelectors = [
    "script",
    "style",
    "noscript",
    "template",
    "iframe",
    "canvas",
    "svg",
    "button",
    "input",
    "select",
    "textarea",
    "form",
    "dialog",
    "nav",
    "aside"
  ];

  for (const element of Array.from(clone.querySelectorAll(blockedSelectors.join(",")))) {
    element.remove();
  }

  for (const element of Array.from(clone.querySelectorAll("*"))) {
    const tagName = element.tagName.toLowerCase();
    if (["header", "footer"].includes(tagName) && root.tagName.toLowerCase() !== tagName) {
      element.remove();
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const keepAttribute =
        name === "href" ||
        name === "src" ||
        name === "alt" ||
        name === "title" ||
        name === "datetime" ||
        name === "cite" ||
        name === "colspan" ||
        name === "rowspan" ||
        name === "scope";
      if (!keepAttribute) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  return normalizeText(clone.innerHTML) ? clone.outerHTML : "";
}

function captureSelectionHtml(range, document, defaultView) {
  const wrapper = document.createElement("div");
  wrapper.appendChild(range.cloneContents());
  const sanitized = sanitizeFragment(wrapper, defaultView);
  if (sanitized.startsWith("<div>") && sanitized.endsWith("</div>")) {
    return sanitized.slice(5, -6);
  }
  return sanitized;
}

function closestContextCandidate(range, document, defaultView) {
  const anchor = elementFromNode(range.commonAncestorContainer, defaultView);
  if (!anchor) {
    return null;
  }

  const selectionTextLength = normalizeText(range.toString()).length;
  const minTextLength = Math.max(selectionTextLength + 40, 160);
  const maxTextLength = 4000;
  const structuredRoot = anchor.closest("article, section, main, [role='main']");
  if (structuredRoot && isVisible(structuredRoot, defaultView)) {
    const structuredTextLength = normalizeText(structuredRoot.textContent).length;
    const structuredHtmlLength = structuredRoot.outerHTML?.length || 0;
    if (structuredTextLength >= minTextLength && structuredTextLength <= maxTextLength * 2 && structuredHtmlLength <= 60000) {
      return structuredRoot;
    }
  }

  const tagPriority = {
    article: 0,
    section: 1,
    table: 2,
    blockquote: 3,
    figure: 4,
    figcaption: 5,
    li: 6,
    p: 7,
    div: 8
  };

  const candidates = [];
  let current = anchor;
  while (current && current !== document.body && current !== document.documentElement) {
    if (isVisible(current, defaultView)) {
      const textLength = normalizeText(current.textContent).length;
      const htmlLength = current.outerHTML?.length || 0;
      if (textLength >= minTextLength && textLength <= maxTextLength && htmlLength <= 40000) {
        candidates.push(current);
      }
    }
    current = current.parentElement;
  }

  const prioritized = candidates
    .filter((candidate) => Object.prototype.hasOwnProperty.call(tagPriority, candidate.tagName.toLowerCase()))
    .sort((left, right) => {
      const leftTag = left.tagName.toLowerCase();
      const rightTag = right.tagName.toLowerCase();
      return (
        (tagPriority[leftTag] ?? Number.MAX_SAFE_INTEGER) -
          (tagPriority[rightTag] ?? Number.MAX_SAFE_INTEGER) ||
        normalizeText(left.textContent).length - normalizeText(right.textContent).length
      );
    });

  if (prioritized.length > 0) {
    return prioritized[0];
  }

  return candidates[0] || anchor.closest("p, li, blockquote, figure, section, article, div, table") || anchor;
}

function extractHeadingPath(range, contextRoot, document, defaultView) {
  const anchor = elementFromNode(range.startContainer, defaultView);
  if (!anchor) {
    return [];
  }

  const root =
    contextRoot?.closest?.("article, main, section, [role='main']") ||
    anchor.closest?.("article, main, section, [role='main']") ||
    document.body;
  const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4"));
  const pathByLevel = [];

  for (const heading of headings) {
    const text = normalizeText(heading.textContent);
    if (!text) {
      continue;
    }

    if (heading === anchor || heading.contains(anchor)) {
      const level = Number.parseInt(heading.tagName.slice(1), 10) || 1;
      pathByLevel[level - 1] = text;
      break;
    }

    const relation = heading.compareDocumentPosition(anchor);
    if (relation & defaultView.Node.DOCUMENT_POSITION_PRECEDING) {
      break;
    }
    if (relation & defaultView.Node.DOCUMENT_POSITION_FOLLOWING) {
      const level = Number.parseInt(heading.tagName.slice(1), 10) || 1;
      pathByLevel[level - 1] = text;
      pathByLevel.splice(level);
    }
  }

  return pathByLevel.filter(Boolean);
}

function pageMetadata(document, locationHref, sectionHeadings) {
  const canonicalUrl =
    normalizeUrl(
      firstMetaContent(document, ["link[rel='canonical']", 'meta[property="og:url"]', 'meta[name="twitter:url"]'])
    ) || normalizeUrl(locationHref);

  const sourceTitle = normalizeText(
    firstMetaContent(document, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) || document.title
  );
  const siteName =
    normalizeText(
      firstMetaContent(document, ['meta[property="og:site_name"]', 'meta[name="application-name"]', 'meta[name="publisher"]'])
    ) ||
    (() => {
      try {
        return new URL(canonicalUrl || locationHref).host;
      } catch {
        return "";
      }
    })();

  const author = normalizeText(
    firstMetaContent(document, [
      'meta[name="author"]',
      'meta[property="author"]',
      'meta[name="parsely-author"]',
      '[itemprop="author"]'
    ])
  );
  const byline = normalizeText(
    firstMetaContent(document, ['[rel="author"]', '[class*="byline"]', '[data-testid*="byline"]'])
  );

  return {
    sourceTitle,
    pageMetadata: {
      canonicalUrl: canonicalUrl || undefined,
      siteName: siteName || undefined,
      description:
        normalizeText(
          firstMetaContent(document, [
            'meta[name="description"]',
            'meta[property="og:description"]',
            'meta[name="twitter:description"]'
          ])
        ) || undefined,
      author: author || undefined,
      byline: byline || undefined,
      publishedAt:
        normalizeText(
          firstMetaContent(document, [
            'meta[property="article:published_time"]',
            'meta[name="article:published_time"]',
            'meta[name="pubdate"]',
            'meta[name="publish-date"]',
            "time[datetime]"
          ])
        ) || undefined,
      language: normalizeText(document.documentElement?.lang) || undefined,
      imageUrl:
        normalizeUrl(
          firstMetaContent(document, ['meta[property="og:image"]', 'meta[name="twitter:image"]'])
        ) || undefined,
      sectionHeadings: sectionHeadings.length ? sectionHeadings : undefined
    }
  };
}

export function captureRichSnippetDetails(input = {}) {
  const runtimeWindow = input.window || globalThis.window;
  const runtimeDocument = input.document || globalThis.document;
  const runtimeLocation = input.location || runtimeWindow?.location || globalThis.location;

  if (!runtimeWindow || !runtimeDocument || typeof runtimeWindow.getSelection !== "function") {
    return {
      ok: false,
      errorMessage: "Unable to read the current selection."
    };
  }

  const selection = runtimeWindow.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return {
      ok: false,
      errorMessage: "Select some text on the page before saving a snippet."
    };
  }

  const range = selection.getRangeAt(0);
  const selectedText = normalizeText(selection.toString());
  if (!selectedText) {
    return {
      ok: false,
      errorMessage: "Select some text on the page before saving a snippet."
    };
  }

  const contextRoot = closestContextCandidate(range, runtimeDocument, runtimeWindow);
  const sectionHeadings = extractHeadingPath(range, contextRoot, runtimeDocument, runtimeWindow);
  const metadata = pageMetadata(runtimeDocument, runtimeLocation?.href || "", sectionHeadings);

  return {
    ok: true,
    sourceUrl: metadata.pageMetadata.canonicalUrl || normalizeUrl(runtimeLocation?.href || ""),
    sourceTitle: metadata.sourceTitle || undefined,
    selectedText,
    selectedHtml: captureSelectionHtml(range, runtimeDocument, runtimeWindow) || undefined,
    contextHtml: sanitizeFragment(contextRoot, runtimeWindow) || undefined,
    pageMetadata: metadata.pageMetadata
  };
}
