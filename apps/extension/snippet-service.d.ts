export declare const SNIPPET_CONTEXT_MENU_IDS: {
  save: string;
  saveWithComment: string;
};

export declare const SNIPPET_DRAFT_STORAGE_PREFIX: string;

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
}): {
  sourceUrl: string;
  sourceTitle?: string;
  selectedText: string;
  comment?: string;
};

export declare function buildSnippetDraft(input?: {
  sourceUrl?: string;
  sourceTitle?: string;
  selectedText?: string;
  comment?: string | null;
  createdAt?: string;
}): {
  sourceUrl: string;
  sourceTitle?: string;
  selectedText: string;
  comment?: string;
  createdAt: string;
};

export declare function submitSelectionSnippet(input?: {
  serverUrl?: string;
  extensionToken?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  selectedText?: string;
  comment?: string | null;
  fetchImpl?: (url: string, init: RequestInit) => Promise<{
    ok: boolean;
    status?: number;
    json: () => Promise<any>;
  }>;
}): Promise<any>;
