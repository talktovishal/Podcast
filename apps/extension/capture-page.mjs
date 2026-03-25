export const HTML_SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024;

export async function capturePageSnapshot(input = {}) {
  const runtimeWindow = input.window || globalThis.window;
  const runtimeDocument = input.document || globalThis.document;
  const runtimeLocation = input.location || runtimeWindow?.location || globalThis.location;
  const byteLimit = Number.isFinite(input.byteLimit) ? input.byteLimit : 2 * 1024 * 1024;
  const settleMs = Number.isFinite(input.settleMs) ? input.settleMs : 120;
  const clickBudget = Number.isFinite(input.clickBudget) ? input.clickBudget : 3;
  const scrollBudget = Number.isFinite(input.scrollBudget) ? input.scrollBudget : 4;
  const plateauBudget = Number.isFinite(input.plateauBudget) ? input.plateauBudget : 2;
  const minRootTextLength = Number.isFinite(input.minRootTextLength) ? input.minRootTextLength : 240;

  if (!runtimeWindow || !runtimeDocument?.documentElement) {
    return {
      ok: false,
      errorMessage: "Unable to read the current page."
    };
  }

  const defaultView = runtimeDocument.defaultView || runtimeWindow;
  const nodeFilter = defaultView.NodeFilter || globalThis.NodeFilter || { SHOW_COMMENT: 128 };
  const textEncoder =
    typeof defaultView.TextEncoder === "function"
      ? new defaultView.TextEncoder()
      : typeof TextEncoder === "function"
        ? new TextEncoder()
        : null;
  const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const lowercase = (value) => normalizeText(value).toLowerCase();
  const uniqueElements = (elements) => {
    const seen = new Set();
    const result = [];
    for (const element of elements) {
      if (!(element instanceof defaultView.Element) || seen.has(element)) {
        continue;
      }
      seen.add(element);
      result.push(element);
    }
    return result;
  };

  function getVisibleText(element) {
    if (!(element instanceof defaultView.Element)) {
      return "";
    }

    if (typeof element.innerText === "string" && element.innerText.length > 0) {
      return normalizeText(element.innerText);
    }

    const parts = [];
    const textWalker = runtimeDocument.createTreeWalker(element, defaultView.NodeFilter?.SHOW_TEXT || 4);
    let current = textWalker.nextNode();
    while (current) {
      const parent = current.parentElement;
      if (parent && isVisible(parent)) {
        const value = normalizeText(current.textContent || "");
        if (value) {
          parts.push(value);
        }
      }
      current = textWalker.nextNode();
    }
    return parts.join(" ");
  }

  function getTextLength(element) {
    return lowercase(getVisibleText(element)).length;
  }

  function getLinkTextLength(element) {
    if (!(element instanceof defaultView.Element)) {
      return 0;
    }
    return Array.from(element.querySelectorAll("a")).reduce((total, link) => total + getTextLength(link), 0);
  }

  function isVisible(element) {
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

  function scoreRootCandidate(element) {
    if (!(element instanceof defaultView.Element) || !isVisible(element)) {
      return Number.NEGATIVE_INFINITY;
    }

    const textLength = getTextLength(element);
    if (textLength < minRootTextLength) {
      return Number.NEGATIVE_INFINITY;
    }

    const paragraphCount = element.querySelectorAll("p").length;
    const headingCount = element.querySelectorAll("h1, h2").length;
    const linkTextLength = getLinkTextLength(element);
    const linkPenalty = textLength > 0 ? Math.round((linkTextLength / textLength) * 500) : 0;
    const tagName = element.tagName.toLowerCase();
    const semanticBonus = tagName === "article" ? 600 : tagName === "main" ? 350 : 0;

    return textLength + paragraphCount * 120 + headingCount * 180 + semanticBonus - linkPenalty;
  }

  function pickBestRoot(selectors, strategy) {
    const candidates = uniqueElements(Array.from(runtimeDocument.querySelectorAll(selectors)));
    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      const score = scoreRootCandidate(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best) {
      return { element: best, strategy };
    }
    return null;
  }

  function findMainContentRoot() {
    const orderedStrategies = [
      { selectors: "article", strategy: "article" },
      { selectors: "main article", strategy: "main-article" },
      { selectors: "main", strategy: "main" },
      { selectors: '[role="main"]', strategy: "role-main" }
    ];

    for (const entry of orderedStrategies) {
      const match = pickBestRoot(entry.selectors, entry.strategy);
      if (match) {
        return match;
      }
    }

    const fallback = pickBestRoot("article, main, [role='main'], section, div", "fallback-largest-text");
    if (fallback) {
      return fallback;
    }

    return {
      element: runtimeDocument.body || runtimeDocument.documentElement,
      strategy: "document-body"
    };
  }

  function rootMetrics(element) {
    const target = element instanceof defaultView.Element ? element : runtimeDocument.body;
    return {
      textLength: getTextLength(target),
      paragraphCount: target?.querySelectorAll("p").length || 0,
      htmlLength: target?.innerHTML?.length || 0
    };
  }

  function grewMeaningfully(before, after) {
    return (
      after.textLength >= before.textLength + 80 ||
      after.paragraphCount > before.paragraphCount ||
      after.htmlLength >= before.htmlLength + 200
    );
  }

  function isSafeAnchor(element) {
    if (element.tagName.toLowerCase() !== "a") {
      return true;
    }
    const href = (element.getAttribute("href") || "").trim().toLowerCase();
    return href === "" || href === "#" || href.startsWith("javascript:");
  }

  function isBlockedControl(element, label) {
    if (!label) {
      return true;
    }

    const blockedLabelPattern =
      /\b(comment|comments|reply|replies|thread|related|share|login|log in|sign in|sign up|follow|subscribe|menu|navigation|next|previous)\b/;
    if (blockedLabelPattern.test(label)) {
      return true;
    }

    const blockedContainerPattern = /\b(comment|reply|thread|related|share|nav|menu|footer|header|signin|login|follow)\b/;
    let current = element;
    while (current && current instanceof defaultView.Element) {
      const descriptor = lowercase(`${current.id || ""} ${current.className || ""} ${current.getAttribute("aria-label") || ""}`);
      if (blockedContainerPattern.test(descriptor)) {
        return true;
      }
      if (current.matches("nav, header, footer, aside, form, dialog, [role='navigation']")) {
        return true;
      }
      current = current.parentElement;
    }

    return false;
  }

  function eligibleControlsForRoot(root) {
    const scopes = uniqueElements([
      root,
      root?.parentElement,
      root?.nextElementSibling,
      root?.parentElement?.nextElementSibling
    ]);
    const selector = "button, summary, [role='button'], [aria-expanded='false'], a";
    const allowedLabelPattern = /\b(load more|read more|continue reading|show more|see more|expand)\b/;
    const controls = [];

    for (const scope of scopes) {
      for (const element of Array.from(scope.querySelectorAll(selector))) {
        if (!(element instanceof defaultView.Element) || !isVisible(element) || element.hasAttribute("disabled")) {
          continue;
        }

        if (!isSafeAnchor(element)) {
          continue;
        }

        const label = lowercase(
          `${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""} ${element.innerText || element.textContent || ""}`
        );
        if (!allowedLabelPattern.test(label) || isBlockedControl(element, label)) {
          continue;
        }

        controls.push(element);
      }
    }

    return uniqueElements(controls);
  }

  function serializeDoctype(doctype) {
    if (!doctype) {
      return "";
    }

    let value = `<!DOCTYPE ${doctype.name}`;
    if (doctype.publicId) {
      value += ` PUBLIC "${doctype.publicId}"`;
    } else if (doctype.systemId) {
      value += " SYSTEM";
    }
    if (doctype.systemId) {
      value += ` "${doctype.systemId}"`;
    }
    return `${value}>`;
  }

  function removeComments(rootElement) {
    const comments = [];
    const walker = runtimeDocument.createTreeWalker(rootElement, nodeFilter.SHOW_COMMENT);
    let current = walker.nextNode();
    while (current) {
      comments.push(current);
      current = walker.nextNode();
    }
    for (const comment of comments) {
      comment.parentNode?.removeChild(comment);
    }
  }

  function cleanSerializedHtml() {
    const clonedRoot = runtimeDocument.documentElement.cloneNode(true);
    if (!(clonedRoot instanceof defaultView.Element)) {
      return "";
    }

    for (const node of Array.from(clonedRoot.querySelectorAll("script, style, noscript, template, [hidden], [aria-hidden='true']"))) {
      node.remove();
    }
    removeComments(clonedRoot);
    return `${serializeDoctype(runtimeDocument.doctype)}${clonedRoot.outerHTML}`;
  }

  function utf8Bytes(value) {
    if (textEncoder) {
      return textEncoder.encode(value).length;
    }
    return new Blob([value]).size;
  }

  async function waitForSettling() {
    if (settleMs <= 0) {
      return;
    }
    await new Promise((resolve) => {
      runtimeWindow.setTimeout(resolve, settleMs);
    });
  }

  function performScrollStep() {
    const amount = Math.max(320, Math.floor((runtimeWindow.innerHeight || 800) * 0.75));
    if (typeof runtimeWindow.scrollBy === "function") {
      try {
        runtimeWindow.scrollBy({ top: amount, left: 0, behavior: "auto" });
        return;
      } catch {
        try {
          runtimeWindow.scrollBy(0, amount);
          return;
        } catch {
          // fall through to manual scroll position update
        }
      }
    }

    const scrollingElement = runtimeDocument.scrollingElement || runtimeDocument.documentElement || runtimeDocument.body;
    if (scrollingElement) {
      scrollingElement.scrollTop = (scrollingElement.scrollTop || 0) + amount;
    }
  }

  const host = lowercase(runtimeLocation?.hostname || "").replace(/^www\./, "");
  const conservativeHost = host === "x.com" || host === "twitter.com" || host === "reddit.com";
  let { element: root, strategy: rootStrategy } = findMainContentRoot();
  let metrics = rootMetrics(root);
  let revealClicks = 0;
  let scrollPasses = 0;
  const clicked = new Set();

  async function runRevealPass() {
    if (conservativeHost || revealClicks >= clickBudget) {
      return false;
    }

    const controls = eligibleControlsForRoot(root);
    for (const control of controls) {
      if (clicked.has(control)) {
        continue;
      }

      const before = rootMetrics(root);
      clicked.add(control);
      if (typeof control.click === "function") {
        control.click();
      } else {
        control.dispatchEvent(new defaultView.MouseEvent("click", { bubbles: true, cancelable: true, view: defaultView }));
      }
      await waitForSettling();

      if (!root?.isConnected) {
        const refreshed = findMainContentRoot();
        root = refreshed.element;
        rootStrategy = refreshed.strategy;
      }

      const after = rootMetrics(root);
      revealClicks += 1;
      metrics = after;
      if (grewMeaningfully(before, after)) {
        return true;
      }

      if (revealClicks >= clickBudget) {
        break;
      }
    }

    return false;
  }

  if (!conservativeHost) {
    await runRevealPass();

    let plateauCount = 0;
    while (scrollPasses < scrollBudget && plateauCount < plateauBudget) {
      const before = rootMetrics(root);
      performScrollStep();
      scrollPasses += 1;
      await waitForSettling();
      await runRevealPass();

      if (!root?.isConnected) {
        const refreshed = findMainContentRoot();
        root = refreshed.element;
        rootStrategy = refreshed.strategy;
      }

      const after = rootMetrics(root);
      metrics = after;
      if (grewMeaningfully(before, after)) {
        plateauCount = 0;
      } else {
        plateauCount += 1;
      }
    }
  }

  const html = cleanSerializedHtml();
  const htmlBytes = utf8Bytes(html);
  const stats = {
    rootStrategy,
    conservativeHost,
    revealClicks,
    scrollPasses,
    textLength: metrics.textLength,
    htmlBytes
  };

  if (htmlBytes > byteLimit) {
    return {
      ok: false,
      errorMessage: "Captured page is too large after safe cleanup. Try a simpler page or a more focused article view.",
      stats
    };
  }

  return {
    ok: true,
    url: runtimeLocation?.href || "",
    title: runtimeDocument.title || "",
    html,
    stats
  };
}
