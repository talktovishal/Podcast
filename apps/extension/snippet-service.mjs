export const SNIPPET_CONTEXT_MENU_IDS = {
  save: "articlepod-save-selection",
  saveWithComment: "articlepod-save-selection-with-comment",
};

export const SNIPPET_DRAFT_STORAGE_PREFIX = "articlepod_snippet_draft_";

export const SNIPPET_PAYLOAD_LIMITS = {
  sourceUrl: 2048,
  sourceTitle: 200,
  selectedText: 20_000,
  comment: 2_000,
  selectedHtml: 12_000,
  contextHtml: 24_000,
  metadataUrl: 2048,
  siteName: 200,
  description: 1500,
  author: 200,
  byline: 400,
  publishedAt: 120,
  language: 40,
  sectionHeadings: 6,
  sectionHeading: 200,
};

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

function clampText(value, maxChars) {
  const normalized = normalizeSnippetText(value);
  if (!normalized) {
    return "";
  }
  return normalized.slice(0, maxChars).trim();
}

function clampOptionalText(value, maxChars) {
  const clamped = clampText(value, maxChars);
  return clamped || undefined;
}

function normalizeOptionalMetadataUrl(
  value,
  maxChars = SNIPPET_PAYLOAD_LIMITS.metadataUrl,
) {
  const normalized = normalizeSnippetText(value);
  if (!normalized || normalized.length > maxChars) {
    return undefined;
  }
  try {
    return new URL(normalized).toString();
  } catch {
    return undefined;
  }
}

function normalizeSnippetPageMetadata(input) {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const pageMetadata = {
    canonicalUrl: normalizeOptionalMetadataUrl(input.canonicalUrl),
    siteName: clampOptionalText(
      input.siteName,
      SNIPPET_PAYLOAD_LIMITS.siteName,
    ),
    description: clampOptionalText(
      input.description,
      SNIPPET_PAYLOAD_LIMITS.description,
    ),
    author: clampOptionalText(input.author, SNIPPET_PAYLOAD_LIMITS.author),
    byline: clampOptionalText(input.byline, SNIPPET_PAYLOAD_LIMITS.byline),
    publishedAt: clampOptionalText(
      input.publishedAt,
      SNIPPET_PAYLOAD_LIMITS.publishedAt,
    ),
    language: clampOptionalText(
      input.language,
      SNIPPET_PAYLOAD_LIMITS.language,
    ),
    imageUrl: normalizeOptionalMetadataUrl(input.imageUrl),
    sectionHeadings: Array.isArray(input.sectionHeadings)
      ? input.sectionHeadings
          .map((value) =>
            clampOptionalText(value, SNIPPET_PAYLOAD_LIMITS.sectionHeading),
          )
          .filter(Boolean)
          .slice(0, SNIPPET_PAYLOAD_LIMITS.sectionHeadings)
      : undefined,
  };

  return Object.fromEntries(
    Object.entries(pageMetadata).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value != null;
    }),
  );
}

export function buildSnippetPayload(input = {}) {
  const sourceUrl =
    typeof input.sourceUrl === "string" ? input.sourceUrl.trim() : "";
  const sourceTitle =
    typeof input.sourceTitle === "string" && input.sourceTitle.trim()
      ? clampText(input.sourceTitle, SNIPPET_PAYLOAD_LIMITS.sourceTitle)
      : undefined;
  const selectedText = clampText(
    input.selectedText,
    SNIPPET_PAYLOAD_LIMITS.selectedText,
  );
  const comment = normalizeSnippetComment(
    clampOptionalText(input.comment, SNIPPET_PAYLOAD_LIMITS.comment),
  );
  const selectedHtml = clampOptionalText(
    input.selectedHtml,
    SNIPPET_PAYLOAD_LIMITS.selectedHtml,
  );
  const contextHtml = clampOptionalText(
    input.contextHtml,
    SNIPPET_PAYLOAD_LIMITS.contextHtml,
  );
  const pageMetadata = normalizeSnippetPageMetadata(input.pageMetadata);

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
    ...(selectedHtml ? { selectedHtml } : {}),
    ...(contextHtml ? { contextHtml } : {}),
    ...(pageMetadata && Object.keys(pageMetadata).length > 0
      ? { pageMetadata }
      : {}),
    ...(comment ? { comment } : {}),
  };
}

export function buildSnippetDraft(input = {}) {
  const payload = buildSnippetPayload(input);
  return {
    ...payload,
    createdAt:
      typeof input.createdAt === "string"
        ? input.createdAt
        : new Date().toISOString(),
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
  const serverUrl =
    typeof input.serverUrl === "string"
      ? input.serverUrl.trim().replace(/\/$/, "")
      : "";
  const extensionToken =
    typeof input.extensionToken === "string" ? input.extensionToken.trim() : "";

  if (!serverUrl) {
    throw new Error("ArticlePod server URL is not available.");
  }
  if (!extensionToken) {
    throw new Error("Connect the extension before saving snippets.");
  }

  const payload = buildSnippetPayload(input);
  const fetchImpl =
    typeof input.fetchImpl === "function" ? input.fetchImpl : fetch;
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
    error.errorCode = responseBody.error_code;
    error.retryRecommended = responseBody.retry_recommended;
    error.supportId = responseBody.support_id;
    throw error;
  }

  return responseBody;
}
