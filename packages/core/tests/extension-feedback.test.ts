import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore -- extension helper ships as a browser module and is imported directly for tests.
import { handleImmediateSave, SNIPPET_TOAST_MESSAGES } from "../../../apps/extension/snippet-feedback.mjs";

function createChromeMock(options: { failToast?: boolean } = {}) {
  const badgeTexts: string[] = [];
  const badgeColors: string[] = [];
  const toastMessages: string[] = [];
  const openedTabs: string[] = [];
  let captureCalls = 0;

  return {
    badgeTexts,
    badgeColors,
    toastMessages,
    openedTabs,
    get captureCalls() {
      return captureCalls;
    },
    chromeApi: {
      action: {
        setBadgeText: async ({ text }: { text: string }) => {
          badgeTexts.push(text);
        },
        setBadgeBackgroundColor: async ({ color }: { color: string }) => {
          badgeColors.push(color);
        },
      },
      scripting: {
        executeScript: async (details: { args?: unknown[] }) => {
          const isToast = typeof details.args?.[0] === "string";
          if (isToast) {
            toastMessages.push(String(details.args?.[0]));
            if (options.failToast) {
              throw new Error("Page rejected toast injection.");
            }
            return [{ result: null }];
          }

          captureCalls += 1;
          return [
            {
              result: {
                ok: true,
                sourceUrl: "https://example.com/article",
                sourceTitle: "Captured title",
                selectedText: "Captured selected text",
                selectedHtml: "<p>Captured selected text</p>",
                contextHtml: "<article><p>Captured selected text</p></article>",
                pageMetadata: { siteName: "Example" },
              },
            },
          ];
        },
      },
      tabs: {
        create: async ({ url }: { url: string }) => {
          openedTabs.push(url);
        },
      },
      storage: {
        local: {
          get: async () => ({}),
          remove: async () => undefined,
        },
      },
    },
  };
}

const testInfo = {
  selectionText: "Fallback selected text",
  pageUrl: "https://example.com/article",
};

const testTab = {
  id: 42,
  url: "https://example.com/article",
  title: "Example article",
};

test("immediate snippet save shows progress and success feedback", async () => {
  const mock = createChromeMock();
  let submittedPayload: Record<string, unknown> | undefined;

  await handleImmediateSave(testInfo, testTab, {
    chromeApi: mock.chromeApi,
    setTimeoutImpl: () => undefined,
    getConnectionState: async () => ({
      activeServerUrl: "https://articlepod.example",
      extensionToken: "secret-token",
    }),
    submitSnippet: async (payload: Record<string, unknown>) => {
      submittedPayload = payload;
      return { ok: true };
    },
  });

  assert.deepEqual(mock.toastMessages, [
    SNIPPET_TOAST_MESSAGES.saving,
    SNIPPET_TOAST_MESSAGES.saved,
  ]);
  assert.deepEqual(mock.badgeTexts, ["...", "OK"]);
  assert.deepEqual(mock.badgeColors, ["#f59e0b", "#15803d"]);
  assert.equal(mock.captureCalls, 1);
  assert.equal(submittedPayload?.serverUrl, "https://articlepod.example");
  assert.equal(submittedPayload?.extensionToken, "secret-token");
  assert.equal(submittedPayload?.selectedText, "Captured selected text");
});

test("immediate snippet save asks disconnected users to connect", async () => {
  const mock = createChromeMock();
  let submitCalled = false;

  await handleImmediateSave(testInfo, testTab, {
    chromeApi: mock.chromeApi,
    setTimeoutImpl: () => undefined,
    getConnectionState: async () => ({
      activeServerUrl: "https://articlepod.example",
      extensionToken: "",
    }),
    submitSnippet: async () => {
      submitCalled = true;
      return { ok: true };
    },
  });

  assert.deepEqual(mock.toastMessages, [SNIPPET_TOAST_MESSAGES.connect]);
  assert.deepEqual(mock.badgeTexts, ["!"]);
  assert.deepEqual(mock.badgeColors, ["#b91c1c"]);
  assert.deepEqual(mock.openedTabs, ["https://articlepod.example/app/chrome-extension"]);
  assert.equal(mock.captureCalls, 0);
  assert.equal(submitCalled, false);
});

test("immediate snippet save shows generic failure feedback without leaking details", async () => {
  const mock = createChromeMock();
  let clearedToken = false;

  await handleImmediateSave(testInfo, testTab, {
    chromeApi: mock.chromeApi,
    setTimeoutImpl: () => undefined,
    getConnectionState: async () => ({
      activeServerUrl: "https://articlepod.example",
      extensionToken: "secret-token",
    }),
    clearToken: async () => {
      clearedToken = true;
    },
    submitSnippet: async () => {
      const error = new Error("Detailed upstream failure.");
      (error as Error & { status?: number }).status = 500;
      throw error;
    },
  });

  assert.deepEqual(mock.toastMessages, [
    SNIPPET_TOAST_MESSAGES.saving,
    SNIPPET_TOAST_MESSAGES.failed,
  ]);
  assert.deepEqual(mock.badgeTexts, ["...", "!"]);
  assert.equal(clearedToken, false);
});

test("immediate snippet save clears rejected tokens and asks users to reconnect", async () => {
  const mock = createChromeMock();
  let clearedToken = false;

  await handleImmediateSave(testInfo, testTab, {
    chromeApi: mock.chromeApi,
    setTimeoutImpl: () => undefined,
    getConnectionState: async () => ({
      activeServerUrl: "https://articlepod.example",
      extensionToken: "stale-token",
    }),
    clearToken: async () => {
      clearedToken = true;
    },
    submitSnippet: async () => {
      const error = new Error("Unauthorized");
      (error as Error & { status?: number }).status = 401;
      throw error;
    },
  });

  assert.deepEqual(mock.toastMessages, [
    SNIPPET_TOAST_MESSAGES.saving,
    SNIPPET_TOAST_MESSAGES.connect,
  ]);
  assert.deepEqual(mock.badgeTexts, ["...", "!"]);
  assert.equal(clearedToken, true);
});

test("toast injection failure does not block snippet saving", async () => {
  const mock = createChromeMock({ failToast: true });
  let submittedPayload: Record<string, unknown> | undefined;

  await handleImmediateSave(testInfo, testTab, {
    chromeApi: mock.chromeApi,
    setTimeoutImpl: () => undefined,
    getConnectionState: async () => ({
      activeServerUrl: "https://articlepod.example",
      extensionToken: "secret-token",
    }),
    submitSnippet: async (payload: Record<string, unknown>) => {
      submittedPayload = payload;
      return { ok: true };
    },
  });

  assert.deepEqual(mock.toastMessages, [
    SNIPPET_TOAST_MESSAGES.saving,
    SNIPPET_TOAST_MESSAGES.saved,
  ]);
  assert.deepEqual(mock.badgeTexts, ["...", "OK"]);
  assert.equal(mock.captureCalls, 1);
  assert.equal(submittedPayload?.selectedText, "Captured selected text");
});
