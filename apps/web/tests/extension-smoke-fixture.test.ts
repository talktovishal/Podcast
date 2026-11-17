import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("packaged extension smoke fixture stays available as a stable local capture target", () => {
  const fixturePath = fileURLToPath(new URL("../public/extension-smoke.html", import.meta.url));
  const fixture = readFileSync(fixturePath, "utf8");

  assert.match(fixture, /ArticlePod Extension Smoke Fixture/);
  assert.match(fixture, /packaged Chrome extension/);
});
