import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("product page keeps a calm three-step story with one trust section", () => {
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
  assert.equal(source.includes("Private RSS feed"), true);
  assert.equal(source.includes("Standard podcast apps"), true);
  assert.equal(source.includes("Your feed, your control"), true);
  assert.equal(
    normalizedSource.includes(
      "Your episodes live in a private feed for personal listening, not public sharing.",
    ),
    true,
  );
  assert.equal(
    normalizedSource.includes(
      "Keep using Apple Podcasts, Pocket Casts, Overcast, and other familiar players.",
    ),
    true,
  );
  assert.equal(
    normalizedSource.includes(
      "If access ever needs to change, you can rotate your feed without disrupting your routine.",
    ),
    true,
  );
  assert.equal(source.includes("Workflow demo"), false);
  assert.equal(source.includes("/resources/articlepod-extension-flow.gif"), false);
  assert.equal(source.includes("What makes the workflow useful"), false);
  assert.equal(source.includes("What happens after you save something"), false);
  assert.equal(source.includes("What you get over time"), false);
});

test("product page ends with one calm closing CTA", () => {
  const source = readFileSync(
    new URL("../src/app/(marketing)/product/page.tsx", import.meta.url),
    "utf8",
  );
  const normalizedSource = source.replace(/\s+/g, " ");

  assert.equal(
    normalizedSource.includes(
      "Start with one article and let the system grow from there.",
    ),
    true,
  );
  assert.equal(
    normalizedSource.includes("with something worth keeping, and let ArticlePod turn it into a calmer listening flow."),
    true,
  );
  assert.equal(source.includes("Start your knowledge feed"), true);
  assert.equal(source.includes('href="/"'), true);
  assert.equal(source.includes("rounded-lg bg-[var(--ink)]"), false);
  assert.equal(source.includes('href="/pricing"'), false);
});
