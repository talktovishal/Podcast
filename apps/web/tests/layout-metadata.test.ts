import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layoutSource = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");

test("layout metadata references branded manifest + icon paths", () => {
  assert.equal(layoutSource.includes("manifest: BRAND_MANIFEST_PATH"), true);
  assert.equal(layoutSource.includes("BRAND_FAVICON_PATH"), true);
  assert.equal(layoutSource.includes("BRAND_APPLE_ICON_PATH"), true);
  assert.equal(layoutSource.includes("BRAND_ICON_192_PATH"), true);
  assert.equal(layoutSource.includes("BRAND_ICON_512_PATH"), true);
});

test("layout metadata uses branded podcast cover for social previews", () => {
  assert.equal(layoutSource.includes("images: [{ url: BRAND_PODCAST_COVER_PATH"), true);
  assert.equal(layoutSource.includes("images: [BRAND_PODCAST_COVER_PATH]"), true);
});
