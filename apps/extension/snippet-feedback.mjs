import {
  clearStoredExtensionToken,
  getStoredConnectionState,
} from "./connection-state.mjs";
import { captureRichSnippetDetails } from "./snippet-capture.mjs";
import { submitSelectionSnippet } from "./snippet-service.mjs";

export const SNIPPET_TOAST_MESSAGES = {
  saving: "Saving to ArticlePod...",
  saved: "Saved to ArticlePod",
  connect: "Connect ArticlePod to save snippets",
  failed: "Could not save snippet",
};

const BADGE_RESET_MS = 3500;
const TOAST_DISMISS_MS = 3200;

function resolveChrome(chromeApi) {
  return chromeApi || chrome;
}

function badgeTimeout(callback, delay, setTimeoutImpl = globalThis.setTimeout) {
  if (typeof setTimeoutImpl === "function") {
    setTimeoutImpl(callback, delay);
  }
}

export async function setBadge(text, color, options = {}) {
  const chromeApi = resolveChrome(options.chromeApi);
  if (!chromeApi.action) {
    return;
  }
  try {
    await chromeApi.action.setBadgeText({ text });
    if (color) {
      await chromeApi.action.setBadgeBackgroundColor({ color });
    }
  } catch {
    // Ignore badge failures in background context.
  }
}

export async function flashBadge(text, color, options = {}) {
  await setBadge(text, color, options);
  badgeTimeout(() => {
    void setBadge("", null, options);
  }, BADGE_RESET_MS, options.setTimeoutImpl);
}

export function renderSnippetToast(message, tone = "info", dismissMs = TOAST_DISMISS_MS) {
  const toastId = "articlepod-snippet-toast";
  const palette =
    tone === "success"
      ? { background: "#14532d", border: "#22c55e" }
      : tone === "error"
        ? { background: "#7f1d1d", border: "#ef4444" }
        : { background: "#111827", border: "#334155" };
  const target = document.body || document.documentElement;
  if (!target) {
    return;
  }

  let toast = document.getElementById(toastId);
  if (!toast) {
    toast = document.createElement("div");
    toast.id = toastId;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    target.appendChild(toast);
  }

  if (toast.dataset.articlepodTimer) {
    window.clearTimeout(Number(toast.dataset.articlepodTimer));
    delete toast.dataset.articlepodTimer;
  }

  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    maxWidth: "min(360px, calc(100vw - 32px))",
    padding: "10px 12px",
    borderRadius: "8px",
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: "#ffffff",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.28)",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: "13px",
    fontWeight: "600",
    lineHeight: "1.35",
    letterSpacing: "0",
    opacity: "1",
    transform: "translateY(0)",
    transition: "opacity 160ms ease, transform 160ms ease",
    pointerEvents: "none",
  });

  if (dismissMs > 0) {
    const timer = window.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      window.setTimeout(() => {
        toast.remove();
      }, 180);
    }, dismissMs);
    toast.dataset.articlepodTimer = String(timer);
  }
}

function canShowToast(tab) {
  return Number.isInteger(tab?.id) && /^https?:/i.test(tab?.url || "");
}

export async function showSnippetToast(tab, message, tone = "info", options = {}) {
  if (!canShowToast(tab)) {
    return;
  }

  const chromeApi = resolveChrome(options.chromeApi);
  try {
    await chromeApi.scripting.executeScript({
      target: { tabId: tab.id },
      func: renderSnippetToast,
      args: [message, tone, options.dismissMs ?? TOAST_DISMISS_MS],
    });
  } catch {
    // Page-level feedback is best-effort; the toolbar badge remains the fallback.
  }
}

export async function openConnectionHelp(serverUrl, options = {}) {
  const chromeApi = resolveChrome(options.chromeApi);
  const url = `${serverUrl || "https://articlepod.com"}/app/chrome-extension`;
  await chromeApi.tabs.create({ url });
}

export async function resolveRichSnippetCapture(info, tab, options = {}) {
  const chromeApi = resolveChrome(options.chromeApi);
  const fallback = {
    sourceUrl: info.frameUrl || tab?.url || info.pageUrl || "",
    sourceTitle: tab?.title || "",
    selectedText: info.selectionText || "",
  };

  if (!tab?.id || !fallback.sourceUrl || !/^https?:/i.test(fallback.sourceUrl)) {
    return fallback;
  }

  try {
    const target =
      Number.isInteger(info.frameId) && info.frameId >= 0
        ? { tabId: tab.id, frameIds: [info.frameId] }
        : { tabId: tab.id };
    const results = await chromeApi.scripting.executeScript({
      target,
      func: captureRichSnippetDetails,
    });
    const capture = results?.[0]?.result;
    if (!capture?.ok || !capture.selectedText) {
      return fallback;
    }

    return {
      sourceUrl: capture.sourceUrl || fallback.sourceUrl,
      sourceTitle: capture.sourceTitle || fallback.sourceTitle,
      selectedText: capture.selectedText,
      ...(capture.selectedHtml ? { selectedHtml: capture.selectedHtml } : {}),
      ...(capture.contextHtml ? { contextHtml: capture.contextHtml } : {}),
      ...(capture.pageMetadata ? { pageMetadata: capture.pageMetadata } : {}),
    };
  } catch {
    return fallback;
  }
}

export async function buildSnippetSubmission({ info, tab, serverUrl, extensionToken, chromeApi }) {
  const capture = await resolveRichSnippetCapture(info, tab, { chromeApi });
  return {
    serverUrl,
    extensionToken,
    ...capture,
  };
}

export async function handleImmediateSave(info, tab, options = {}) {
  const chromeApi = resolveChrome(options.chromeApi);
  const setTimeoutImpl = options.setTimeoutImpl;
  const getConnectionState = options.getConnectionState || (() => getStoredConnectionState(chromeApi.storage.local));
  const clearToken = options.clearToken || (() => clearStoredExtensionToken(chromeApi.storage.local));
  const submitSnippet = options.submitSnippet || submitSelectionSnippet;

  try {
    const { activeServerUrl, extensionToken } = await getConnectionState();
    if (!extensionToken) {
      await showSnippetToast(tab, SNIPPET_TOAST_MESSAGES.connect, "error", { chromeApi });
      await flashBadge("!", "#b91c1c", { chromeApi, setTimeoutImpl });
      await openConnectionHelp(activeServerUrl, { chromeApi });
      return;
    }

    await setBadge("...", "#f59e0b", { chromeApi });
    await showSnippetToast(tab, SNIPPET_TOAST_MESSAGES.saving, "info", {
      chromeApi,
      dismissMs: 0,
    });
    await submitSnippet(
      await buildSnippetSubmission({
        info,
        tab,
        serverUrl: activeServerUrl,
        extensionToken,
        chromeApi,
      }),
    );
    await showSnippetToast(tab, SNIPPET_TOAST_MESSAGES.saved, "success", { chromeApi });
    await flashBadge("OK", "#15803d", { chromeApi, setTimeoutImpl });
  } catch (error) {
    const needsReconnect = error && typeof error === "object" && (error.status === 401 || error.status === 403);
    if (needsReconnect) {
      await clearToken();
    }
    await showSnippetToast(
      tab,
      needsReconnect ? SNIPPET_TOAST_MESSAGES.connect : SNIPPET_TOAST_MESSAGES.failed,
      "error",
      { chromeApi },
    );
    await flashBadge("!", "#b91c1c", { chromeApi, setTimeoutImpl });
  }
}
