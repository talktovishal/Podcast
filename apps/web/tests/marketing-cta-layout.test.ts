import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("marketing footer CTA gives the primary action more mobile width while letting labels wrap", () => {
  const source = readFileSync(
    new URL("../src/components/marketing-cta.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(
    source.includes('grid grid-cols-2 items-center gap-2'),
    true,
  );
  assert.equal(
    source.includes('className="inline-flex w-full justify-center rounded-lg bg-[var(--ink)] px-3 py-2 text-center text-xs font-semibold leading-tight text-white sm:px-4 sm:text-sm sm:whitespace-nowrap"'),
    true,
  );
  assert.equal(
    source.includes('className="inline-flex w-[78%] justify-self-end justify-center rounded-lg border border-[#bfded4] bg-white px-3 py-2 text-center text-xs font-semibold leading-tight text-[var(--ink)] sm:w-auto sm:px-4 sm:text-sm sm:whitespace-nowrap"'),
    true,
  );
  assert.equal(source.includes("whitespace-nowrap rounded-lg bg-[var(--ink)]"), false);
  assert.equal(source.includes("whitespace-nowrap rounded-lg border border-[#bfded4]"), false);
});
