import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("marketing footer CTA gives the primary action more mobile width without increasing its text size", () => {
  const source = readFileSync(
    new URL("../src/components/marketing-cta.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(
    source.includes('grid grid-cols-2 items-center gap-2'),
    true,
  );
  assert.equal(
    source.includes('className="inline-flex w-full justify-center whitespace-nowrap rounded-lg bg-[var(--ink)] px-3 py-2 text-xs font-semibold text-white sm:px-4 sm:text-sm"'),
    true,
  );
  assert.equal(
    source.includes('className="inline-flex w-[78%] justify-self-end justify-center whitespace-nowrap rounded-lg border border-[#bfded4] bg-white px-3 py-2 text-xs font-semibold text-[var(--ink)] sm:w-auto sm:px-4 sm:text-sm"'),
    true,
  );
  assert.equal(source.includes("px-4 py-2.5 text-sm font-semibold text-white"), false);
});
