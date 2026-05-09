import assert from "node:assert/strict";
import test from "node:test";
import { formatUpdatedDate } from "../src/components/wiki-browser-client";

test("formatUpdatedDate keeps date-only wiki metadata on the same calendar day", () => {
  assert.equal(formatUpdatedDate("2026-04-28"), "Apr 28, 2026");
});

test("formatUpdatedDate still supports ISO timestamps", () => {
  assert.equal(formatUpdatedDate("2026-05-09T15:43:07.523Z"), "May 9, 2026");
});
