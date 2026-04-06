declare module "../../../apps/extension/snippet-service.mjs" {
  export const SNIPPET_CONTEXT_MENU_IDS: {
    save: string;
    saveWithComment: string;
  };

  export function createSnippetContextMenuItems(): Array<{
    id: string;
    title: string;
    contexts: string[];
  }>;

  export function buildSnippetPayload(input?: {
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

  export function submitSelectionSnippet(input?: {
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
}
