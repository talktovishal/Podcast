import assert from "node:assert/strict";
import test from "node:test";
import { copyText } from "../src/lib/copy-text";

test("copyText prefers the async Clipboard API when available", async () => {
  let copiedValue = "";

  const copied = await copyText("feed-value", {
    navigatorObject: {
      clipboard: {
        writeText: async (value: string) => {
          copiedValue = value;
        }
      }
    }
  });

  assert.equal(copied, true);
  assert.equal(copiedValue, "feed-value");
});

test("copyText falls back to execCommand when Clipboard API access fails", async () => {
  const events: string[] = [];
  let focused = false;
  let selected = false;

  const textarea = {
    value: "",
    setAttribute: (name: string, value: string) => {
      events.push(`attr:${name}:${value}`);
    },
    style: {
      position: "",
      opacity: ""
    },
    focus: () => {
      focused = true;
    },
    select: () => {
      selected = true;
    }
  };

  const copied = await copyText("connect-code", {
    navigatorObject: {
      clipboard: {
        writeText: async () => {
          throw new Error("clipboard denied");
        }
      }
    },
    documentObject: {
      body: {
        appendChild: () => {
          events.push("append");
        },
        removeChild: () => {
          events.push("remove");
        }
      },
      createElement: (tagName: string) => {
        assert.equal(tagName, "textarea");
        return textarea;
      },
      execCommand: (command: string) => {
        events.push(`exec:${command}`);
        return true;
      }
    }
  });

  assert.equal(copied, true);
  assert.equal(textarea.value, "connect-code");
  assert.equal(focused, true);
  assert.equal(selected, true);
  assert.deepEqual(events, ["attr:readonly:true", "append", "exec:copy", "remove"]);
});
