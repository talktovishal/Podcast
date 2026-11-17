import {
  clearStoredExtensionToken,
  getStoredConnectionState,
} from "./connection-state.mjs";
import {
  draftStorageKey,
  submitSelectionSnippet,
} from "./snippet-service.mjs";

const els = {
  sourceTitle: document.getElementById("source-title"),
  sourceUrl: document.getElementById("source-url"),
  selectedText: document.getElementById("selected-text"),
  commentInput: document.getElementById("comment-input"),
  saveBtn: document.getElementById("save-btn"),
  cancelBtn: document.getElementById("cancel-btn"),
  status: document.getElementById("status"),
};

function setStatus(message, type = "") {
  els.status.textContent = message || "";
  els.status.className = `status ${type}`.trim();
}

function draftIdFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return params.get("draft") || "";
}

async function loadDraft() {
  const draftId = draftIdFromLocation();
  if (!draftId) {
    throw new Error("Snippet draft is missing.");
  }

  const storageKey = draftStorageKey(draftId);
  const result = await chrome.storage.local.get(storageKey);
  const draft = result[storageKey];

  if (!draft || typeof draft !== "object") {
    throw new Error("Snippet draft could not be loaded.");
  }

  return {
    draftId,
    storageKey,
    draft,
  };
}

async function saveSnippet() {
  els.saveBtn.disabled = true;
  els.cancelBtn.disabled = true;
  setStatus("Saving snippet...");

  try {
    const { draftId, storageKey, draft } = await loadDraft();
    const connection = await getStoredConnectionState();
    if (!connection.extensionToken) {
      throw new Error("Connect the extension before saving snippets.");
    }

    await submitSelectionSnippet({
      serverUrl: connection.activeServerUrl,
      extensionToken: connection.extensionToken,
      sourceUrl: draft.sourceUrl,
      sourceTitle: draft.sourceTitle,
      selectedText: draft.selectedText,
      comment: els.commentInput.value,
    });
    await chrome.storage.local.remove(storageKey);
    setStatus("Snippet saved. Closing...");
    window.setTimeout(() => {
      window.close();
    }, 900);
    void draftId;
  } catch (error) {
    if (error && typeof error === "object" && (error.status === 401 || error.status === 403)) {
      await clearStoredExtensionToken();
    }
    setStatus(
      error instanceof Error ? error.message : "Unable to save snippet.",
      "error",
    );
    els.saveBtn.disabled = false;
    els.cancelBtn.disabled = false;
  }
}

async function initialize() {
  try {
    const { draft } = await loadDraft();
    els.sourceTitle.textContent = draft.sourceTitle || "Saved selection";
    els.sourceUrl.href = draft.sourceUrl;
    els.sourceUrl.textContent = draft.sourceUrl;
    els.selectedText.textContent = draft.selectedText;
    els.commentInput.value = draft.comment || "";
    els.commentInput.focus();
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "Snippet draft could not be loaded.",
      "error",
    );
    els.saveBtn.disabled = true;
  }
}

els.cancelBtn.addEventListener("click", () => {
  window.close();
});

els.saveBtn.addEventListener("click", () => {
  void saveSnippet();
});

void initialize();
