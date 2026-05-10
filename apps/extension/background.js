import { getStoredConnectionState } from "./connection-state.mjs";
import {
  buildSnippetDraft,
  createSnippetContextMenuItems,
  draftStorageKey,
  SNIPPET_CONTEXT_MENU_IDS,
} from "./snippet-service.mjs";
import {
  flashBadge,
  handleImmediateSave,
  resolveRichSnippetCapture,
} from "./snippet-feedback.mjs";

const COMMENT_WINDOW_WIDTH = 500;
const COMMENT_WINDOW_HEIGHT = 640;

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

async function resolveSnippetDraft(info, tab) {
  return resolveRichSnippetCapture(info, tab);
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
