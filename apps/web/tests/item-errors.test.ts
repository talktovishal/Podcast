import assert from "node:assert/strict";
import test from "node:test";
import { recommendsChromeExtensionCapture } from "../src/lib/item-errors";

test("recommends chrome extension capture only for the targeted blocked-site message", () => {
  assert.equal(
    recommendsChromeExtensionCapture(
      "This site blocked server-side access. If the page opens in your browser, capture it with the Chrome extension instead of submitting the URL directly."
    ),
    true
  );
  assert.equal(recommendsChromeExtensionCapture("The source site timed out while fetching content. Retry or try another URL."), false);
});
