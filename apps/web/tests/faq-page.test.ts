import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const faqSource = readFileSync(
  new URL("../src/app/(marketing)/faq/page.tsx", import.meta.url),
  "utf8",
);

test("faq page groups questions into five plain-language sections", () => {
  assert.equal(faqSource.includes("Getting started"), true);
  assert.equal(faqSource.includes("Inputs & capture"), true);
  assert.equal(faqSource.includes("Privacy & feed"), true);
  assert.equal(faqSource.includes("Podcast apps"), true);
  assert.equal(faqSource.includes("Account & access"), true);
  assert.equal(faqSource.includes("const faqSections"), true);
});

test("faq page adds quick answers that deep-link to section anchors", () => {
  assert.equal(faqSource.includes("Quick answers"), true);
  assert.equal(faqSource.includes("One save becomes one episode"), true);
  assert.equal(faqSource.includes("URLs, PDFs, and Chrome capture"), true);
  assert.equal(faqSource.includes("Private feed URL you control"), true);
  assert.equal(faqSource.includes("Works in standard podcast apps"), true);
  assert.equal(faqSource.includes('href={item.href}'), true);
  assert.equal(faqSource.includes('id={section.id}'), true);
  assert.equal(faqSource.includes("scroll-mt-24"), true);
});

test("faq page preserves the existing question copy and schema coverage", () => {
  assert.equal(faqSource.includes("What happens when I save an article?"), true);
  assert.equal(faqSource.includes("Can I upload scanned PDFs?"), true);
  assert.equal(faqSource.includes("weekly podcast and email options"), true);
  assert.equal(faqSource.includes("faqSchemaItems.map"), true);
});
