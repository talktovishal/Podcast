import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const EXTENSION_ROOT = resolve(REPO_ROOT, "apps/extension");
const PACKAGED_EXTENSION_ROOT = resolve(REPO_ROOT, "dist/extension/package");

function extractRelativeImports(source: string): string[] {
  const matches = source.matchAll(/from\s+["'](\.\/[^"']+)["']/g);
  return [...new Set(Array.from(matches, (match) => match[1] || ""))].sort();
}

test("packaged extension includes popup runtime dependencies", () => {
  const popupSource = readFileSync(resolve(EXTENSION_ROOT, "popup.js"), "utf8");
  const popupRelativeImports = extractRelativeImports(popupSource);

  assert.equal(popupRelativeImports.includes("./target-tab.mjs"), true);

  execFileSync(resolve(REPO_ROOT, "scripts/package-extension.sh"), {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ARTICLEPOD_DISABLE_SIPS: "1",
    },
    stdio: "pipe"
  });

  for (const relativeImport of popupRelativeImports) {
    const packagedPath = resolve(PACKAGED_EXTENSION_ROOT, relativeImport.replace(/^\.\//, ""));
    assert.equal(
      existsSync(packagedPath),
      true,
      `Expected packaged popup dependency ${relativeImport} to exist at ${packagedPath}`
    );
  }
});
