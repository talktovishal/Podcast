import assert from "node:assert/strict";
import test from "node:test";
import { resolvePopupTargetTab } from "../../../apps/extension/target-tab.mjs";

test("resolvePopupTargetTab honors the explicit tab override", async () => {
  const chromeApi = {
    tabs: {
      get: async (tabId: number) => ({ id: tabId, url: "https://example.com/one" }),
      query: async () => {
        throw new Error("query should not be used when tab override is present");
      }
    }
  };

  const tab = await resolvePopupTargetTab(chromeApi, "?tab=17");
  assert.equal(tab?.id, 17);
});

test("resolvePopupTargetTab can find a target by URL fallback", async () => {
  const chromeApi = {
    tabs: {
      get: async () => {
        throw new Error("get should not be used when no tab override is present");
      },
      query: async () => [
        { id: 1, url: "https://example.com/one" },
        { id: 2, url: "https://example.com/two/" }
      ]
    }
  };

  const tab = await resolvePopupTargetTab(chromeApi, "?targetUrl=https%3A%2F%2Fexample.com%2Ftwo");
  assert.equal(tab?.id, 2);
});
