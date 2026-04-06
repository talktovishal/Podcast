import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("product page keeps a calm three-step story with one workflow demo and one trust section", () => {
  const source = readFileSync(
    new URL("../src/app/(marketing)/product/page.tsx", import.meta.url),
    "utf8",
  );
  const normalizedSource = source.replace(/\s+/g, " ");

  assert.equal(normalizedSource.includes("Save. Listen. Recap."), true);
  assert.equal(
    normalizedSource.includes(
      "One calm rhythm for turning saved reading into something you actually finish.",
    ),
    true,
  );
  assert.equal(source.includes("Save what matters"), true);
  assert.equal(source.includes("Listen in the app you already use"), true);
  assert.equal(source.includes("Recap when you want the throughline"), true);
  assert.equal(
    normalizedSource.includes(
      "See the capture flow once, then let it stay out of the way.",
    ),
    true,
  );
  assert.equal(
    source.includes("/resources/articlepod-extension-flow.gif"),
    true,
  );
  assert.equal(source.includes("Private RSS feed"), true);
  assert.equal(source.includes("Standard podcast apps"), true);
  assert.equal(source.includes("Your feed, your control"), true);
  assert.equal(source.includes("What makes the workflow useful"), false);
  assert.equal(source.includes("What happens after you save something"), false);
  assert.equal(source.includes("What you get over time"), false);
});
