export const SNIPPET_CONTEXT_MENU_IDS = {
  save: "articlepod-save-selection",
  saveWithComment: "articlepod-save-selection-with-comment",
};

export const SNIPPET_DRAFT_STORAGE_PREFIX = "articlepod_snippet_draft_";

export function createSnippetContextMenuItems() {
  return [
    {
      id: SNIPPET_CONTEXT_MENU_IDS.save,
      title: "Save selection to ArticlePod",
      contexts: ["selection"],
    },
    {
      id: SNIPPET_CONTEXT_MENU_IDS.saveWithComment,
      title: "Save selection with comment to ArticlePod...",
      contexts: ["selection"],
    },
  ];
}

export function draftStorageKey(draftId) {
  return `${SNIPPET_DRAFT_STORAGE_PREFIX}${draftId}`;
}

export function normalizeSnippetText(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function normalizeSnippetComment(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function buildSnippetPayload(input = {}) {
  const sourceUrl = typeof input.sourceUrl === "string" ? input.sourceUrl.trim() : "";
  const sourceTitle =
    typeof input.sourceTitle === "string" && input.sourceTitle.trim()
      ? input.sourceTitle.trim()
      : undefined;
  const selectedText = normalizeSnippetText(input.selectedText);
  const comment = normalizeSnippetComment(input.comment);

  if (!sourceUrl) {
    throw new Error("A page URL is required to save a snippet.");
  }

  if (!selectedText) {
    throw new Error("Select some text on the page before saving a snippet.");
  }

  return {
    sourceUrl,
    sourceTitle,
    selectedText,
    ...(comment ? { comment } : {}),
  };
}

export function buildSnippetDraft(input = {}) {
  const payload = buildSnippetPayload(input);
  return {
    ...payload,
    createdAt: typeof input.createdAt === "string" ? input.createdAt : new Date().toISOString(),
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function submitSelectionSnippet(input = {}) {
  const serverUrl = typeof input.serverUrl === "string" ? input.serverUrl.trim().replace(/\/$/, "") : "";
  const extensionToken = typeof input.extensionToken === "string" ? input.extensionToken.trim() : "";

  if (!serverUrl) {
    throw new Error("ArticlePod server URL is not available.");
  }
  if (!extensionToken) {
    throw new Error("Connect the extension before saving snippets.");
  }

  const payload = buildSnippetPayload(input);
  const fetchImpl = typeof input.fetchImpl === "function" ? input.fetchImpl : fetch;
  const response = await fetchImpl(`${serverUrl}/api/snippets`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${extensionToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const responseBody = await readJson(response);

  if (!response.ok) {
    const error = new Error(
      responseBody.error_message || "Unable to save snippet right now.",
    );
    error.status = response.status;
    throw error;
  }

  return responseBody;
}
