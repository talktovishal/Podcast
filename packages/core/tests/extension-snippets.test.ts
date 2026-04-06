import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore -- extension helper ships as a browser module and is imported directly for tests.
import { buildSnippetPayload, createSnippetContextMenuItems, submitSelectionSnippet } from "../../../apps/extension/snippet-service.mjs";

test("createSnippetContextMenuItems registers both selection-only actions", () => {
  const items = createSnippetContextMenuItems();

  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item: { contexts: string[] }) => item.contexts),
    [["selection"], ["selection"]],
  );
  assert.equal(items[0]?.title, "Save selection to ArticlePod");
  assert.equal(items[1]?.title, "Save selection with comment to ArticlePod...");
});

test("buildSnippetPayload trims selection and optional comment", () => {
  const payload = buildSnippetPayload({
    sourceUrl: "https://example.com/article",
    sourceTitle: "Example title",
    selectedText: "  Saved text  ",
    comment: "  useful context  ",
  });

  assert.deepEqual(payload, {
    sourceUrl: "https://example.com/article",
    sourceTitle: "Example title",
    selectedText: "Saved text",
    comment: "useful context",
  });
});

test("submitSelectionSnippet includes comment when saving a comment-backed snippet", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;

  const response = await submitSelectionSnippet({
    serverUrl: "https://articlepod.example",
    extensionToken: "secret-token",
    sourceUrl: "https://example.com/highlight",
    sourceTitle: "Highlighted article",
    selectedText: "Important selection",
    comment: "follow up later",
    fetchImpl: async (url: string, init: RequestInit) => {
      requestedUrl = String(url);
      requestedInit = init;
      return {
        ok: true,
        json: async () => ({ ok: true, snippet: { id: "snippet-1" } }),
      };
    },
  });

  assert.equal(requestedUrl, "https://articlepod.example/api/snippets");
  assert.equal(requestedInit?.method, "POST");
  const headers = requestedInit?.headers as Record<string, string> | undefined;
  assert.equal(headers?.authorization, "Bearer secret-token");
  assert.deepEqual(JSON.parse(String(requestedInit?.body)), {
    sourceUrl: "https://example.com/highlight",
    sourceTitle: "Highlighted article",
    selectedText: "Important selection",
    comment: "follow up later",
  });
  assert.deepEqual(response, { ok: true, snippet: { id: "snippet-1" } });
});
