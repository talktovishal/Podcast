export declare const SNIPPET_CONTEXT_MENU_IDS: {
  save: string;
  saveWithComment: string;
};

export declare const SNIPPET_DRAFT_STORAGE_PREFIX: string;

export declare const SNIPPET_PAYLOAD_LIMITS: {
  sourceUrl: number;
  sourceTitle: number;
  selectedText: number;
  comment: number;
  selectedHtml: number;
  contextHtml: number;
  metadataUrl: number;
  siteName: number;
  description: number;
  author: number;
  byline: number;
  publishedAt: number;
  language: number;
  sectionHeadings: number;
  sectionHeading: number;
};

export declare function createSnippetContextMenuItems(): Array<{
  id: string;
  title: string;
  contexts: string[];
}>;

export declare function draftStorageKey(draftId: string): string;

export declare function normalizeSnippetText(value: unknown): string;

export declare function normalizeSnippetComment(value: unknown): string | null;

export declare function buildSnippetPayload(input?: {
  sourceUrl?: string;
  sourceTitle?: string;
  selectedText?: string;
  comment?: string | null;
  selectedHtml?: string;
  contextHtml?: string;
  pageMetadata?: {
    canonicalUrl?: string;
    siteName?: string;
    description?: string;
    author?: string;
    byline?: string;
    publishedAt?: string;
    language?: string;
    imageUrl?: string;
    sectionHeadings?: string[];
  };
}): {
  sourceUrl: string;
  sourceTitle?: string;
  selectedText: string;
  comment?: string;
  selectedHtml?: string;
  contextHtml?: string;
  pageMetadata?: {
    canonicalUrl?: string;
    siteName?: string;
    description?: string;
    author?: string;
    byline?: string;
    publishedAt?: string;
    language?: string;
    imageUrl?: string;
    sectionHeadings?: string[];
  };
};

export declare function buildSnippetDraft(input?: {
  sourceUrl?: string;
  sourceTitle?: string;
  selectedText?: string;
  comment?: string | null;
  selectedHtml?: string;
  contextHtml?: string;
  pageMetadata?: {
    canonicalUrl?: string;
    siteName?: string;
    description?: string;
    author?: string;
    byline?: string;
    publishedAt?: string;
    language?: string;
    imageUrl?: string;
    sectionHeadings?: string[];
  };
  createdAt?: string;
}): {
  sourceUrl: string;
  sourceTitle?: string;
  selectedText: string;
  comment?: string;
  selectedHtml?: string;
  contextHtml?: string;
  pageMetadata?: {
    canonicalUrl?: string;
    siteName?: string;
    description?: string;
    author?: string;
    byline?: string;
    publishedAt?: string;
    language?: string;
    imageUrl?: string;
    sectionHeadings?: string[];
  };
  createdAt: string;
};

export declare function submitSelectionSnippet(input?: {
  serverUrl?: string;
  extensionToken?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  selectedText?: string;
  comment?: string | null;
  selectedHtml?: string;
  contextHtml?: string;
  pageMetadata?: {
    canonicalUrl?: string;
    siteName?: string;
    description?: string;
    author?: string;
    byline?: string;
    publishedAt?: string;
    language?: string;
    imageUrl?: string;
    sectionHeadings?: string[];
  };
  fetchImpl?: (
    url: string,
    init: RequestInit,
  ) => Promise<{
    ok: boolean;
    status?: number;
    json: () => Promise<any>;
  }>;
}): Promise<any>;
