import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chunkText } from "../src/chunking/chunkText";
import { AppError, errorCodes } from "../src/errors/codes";

test("chunkText is deterministic", () => {
  const input = "Paragraph one. Sentence two.\n\nParagraph two with more text.";
  const a = chunkText(input, 30);
  const b = chunkText(input, 30);

  assert.deepEqual(a, b);
  assert.ok(a.length > 1);
  assert.equal(new Set(a.map((chunk) => chunk.hash)).size, a.length);
  assert.deepEqual(a.map((chunk) => chunk.text), ["Paragraph one. Sentence two.", "Paragraph two with more text."]);
});

test("oversized sentences prefer word boundaries and retain their whitespace and content", () => {
  const input = "alpha beta\tgamma  delta epsilon zeta eta theta iota";
  const chunks = chunkText(input, 16);
  assert.equal(chunks[0]?.text, "alpha beta\t");
  assert.equal(chunks.map((chunk) => chunk.text).join(""), input);
  assert.ok(chunks.every((chunk) => chunk.text.length > 0 && chunk.text.length <= 16));
  assert.deepEqual(chunkText(input, 16), chunks);
  for (const [index, chunk] of chunks.entries()) {
    assert.equal(chunk.index, index);
    assert.equal(chunk.hash, createHash("sha256").update(chunk.text).digest("hex"));
  }
});

test("unbroken tokens and Unicode are bounded without cutting surrogate pairs or losing content", () => {
  for (const input of ["x".repeat(9000), "ab\u{1f642}cd".repeat(30), "\u{1f642}".repeat(30), "a" + " ".repeat(100) + "b"]) {
    for (const limit of [2, 3, 5, 17]) {
      const chunks = chunkText(input, limit);
      assert.equal(chunks.map((chunk) => chunk.text).join(""), input);
      assert.ok(chunks.every((chunk) => chunk.text.length > 0 && chunk.text.length <= limit));
      for (const chunk of chunks) {
        assert.doesNotMatch(chunk.text, /[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/u);
      }
    }
  }
});

test("overflow keeps neighboring sentences in order and leaves exact-boundary inputs intact", () => {
  const chunks = chunkText("First.\t" + "x".repeat(25) + "!  Last.", 10);
  assert.deepEqual(chunks.map((chunk) => chunk.text), ["First.", "xxxxxxxxxx", "xxxxxxxxxx", "xxxxx!", "Last."]);
  assert.deepEqual(chunkText("1234567890", 10).map((chunk) => chunk.text), ["1234567890"]);
  assert.deepEqual(chunkText(" \r\n\t ", 10), []);
});

test("invalid limits fail explicitly instead of emitting oversized chunks or stalling", () => {
  for (const limit of [0, 1, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => chunkText("text", limit), (error) =>
      error instanceof AppError && error.code === errorCodes.INVALID_INPUT
    );
  }
});
