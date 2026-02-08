import test from "node:test";
import assert from "node:assert/strict";
import { chunkText } from "../src/chunking/chunkText";

test("chunkText is deterministic", () => {
  const input = "Paragraph one. Sentence two.\n\nParagraph two with more text.";
  const a = chunkText(input, 30);
  const b = chunkText(input, 30);

  assert.deepEqual(a, b);
  assert.ok(a.length > 1);
  assert.equal(new Set(a.map((chunk) => chunk.hash)).size, a.length);
});
