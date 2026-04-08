import {
  clearStoredExtensionToken,
  getStoredConnectionState,
} from "./connection-state.mjs";
import {
  buildSnippetDraft,
  createSnippetContextMenuItems,
  draftStorageKey,
  SNIPPET_CONTEXT_MENU_IDS,
  submitSelectionSnippet,
} from "./snippet-service.mjs";
import { captureRichSnippetDetails } from "./snippet-capture.mjs";

const BADGE_RESET_MS = 3500;
const COMMENT_WINDOW_WIDTH = 500;
const COMMENT_WINDOW_HEIGHT = 640;

function badgeTimeout(callback, delay) {
  if (typeof globalThis.setTimeout === "function") {
    globalThis.setTimeout(callback, delay);
  }
}

async function setBadge(text, color) {
  if (!chrome.action) {
    return;
  }
  try {
    await chrome.action.setBadgeText({ text });
    if (color) {
      await chrome.action.setBadgeBackgroundColor({ color });
    }
  } catch {
    // Ignore badge failures in background context.
  }
}

async function flashBadge(text, color) {
  await setBadge(text, color);
  badgeTimeout(() => {
    void setBadge("", null);
  }, BADGE_RESET_MS);
}

function createContextMenu(item) {
  return new Promise((resolve) => {
    chrome.contextMenus.create(item, () => resolve());
  });
}

async function ensureContextMenus() {
  if (!chrome.contextMenus) {
    return;
  }
  await chrome.contextMenus.removeAll();
  for (const item of createSnippetContextMenuItems()) {
    await createContextMenu(item);
  }
}

function resolveSnippetPageUrl() {
  return chrome.runtime.getURL("snippet-comment.html");
}

async function openConnectionHelp(serverUrl) {
  const url = `${serverUrl || "https://articlepod.com"}/app/chrome-extension`;
  await chrome.tabs.create({ url });
}

async function handleImmediateSave(info, tab) {
  try {
    const { activeServerUrl, extensionToken } = await getStoredConnectionState();
    if (!extensionToken) {
      await flashBadge("!", "#b91c1c");
      await openConnectionHelp(activeServerUrl);
      return;
    }

    await submitSelectionSnippet(
      await buildSnippetSubmission({
        info,
        tab,
        serverUrl: activeServerUrl,
        extensionToken,
      }),
    );
    await flashBadge("OK", "#15803d");
  } catch (error) {
    if (error && typeof error === "object" && (error.status === 401 || error.status === 403)) {
      await clearStoredExtensionToken();
    }
    await flashBadge("!", "#b91c1c");
  }
}

async function handleSaveWithComment(info, tab) {
  try {
    const { activeServerUrl, extensionToken } = await getStoredConnectionState();
    if (!extensionToken) {
      await flashBadge("!", "#b91c1c");
      await openConnectionHelp(activeServerUrl);
      return;
    }

    const draftId =
      typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}`;
    const storageKey = draftStorageKey(draftId);
    const draft = buildSnippetDraft(await resolveSnippetDraft(info, tab));

    await chrome.storage.local.set({
      [storageKey]: draft,
    });
    await chrome.windows.create({
      url: `${resolveSnippetPageUrl()}?draft=${encodeURIComponent(draftId)}`,
      type: "popup",
      width: COMMENT_WINDOW_WIDTH,
      height: COMMENT_WINDOW_HEIGHT,
    });
  } catch {
    await flashBadge("!", "#b91c1c");
  }
}

async function resolveRichSnippetCapture(info, tab) {
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
    const results = await chrome.scripting.executeScript({
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

async function resolveSnippetDraft(info, tab) {
  return resolveRichSnippetCapture(info, tab);
}

async function buildSnippetSubmission({ info, tab, serverUrl, extensionToken }) {
  const capture = await resolveRichSnippetCapture(info, tab);
  return {
    serverUrl,
    extensionToken,
    ...capture,
  };
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureContextMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === SNIPPET_CONTEXT_MENU_IDS.save) {
    void handleImmediateSave(info, tab);
  }
  if (info.menuItemId === SNIPPET_CONTEXT_MENU_IDS.saveWithComment) {
    void handleSaveWithComment(info, tab);
  }
});
