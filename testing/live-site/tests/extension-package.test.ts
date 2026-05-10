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

test("packaged extension includes background, popup, and snippet runtime dependencies", () => {
  const runtimeEntries = ["popup.js", "background.js", "snippet-comment.js", "snippet-feedback.mjs"];
  const runtimeRelativeImports = [
    ...new Set(
      runtimeEntries.flatMap((entry) =>
        extractRelativeImports(readFileSync(resolve(EXTENSION_ROOT, entry), "utf8"))
      )
    )
  ].sort();

  assert.equal(runtimeRelativeImports.includes("./target-tab.mjs"), true);
  assert.equal(runtimeRelativeImports.includes("./snippet-feedback.mjs"), true);
  assert.equal(runtimeRelativeImports.includes("./snippet-service.mjs"), true);

  execFileSync(resolve(REPO_ROOT, "scripts/package-extension.sh"), {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ARTICLEPOD_DISABLE_SIPS: "1",
    },
    stdio: "pipe"
  });

  for (const entry of runtimeEntries) {
    assert.equal(
      existsSync(resolve(PACKAGED_EXTENSION_ROOT, entry)),
      true,
      `Expected packaged runtime entry ${entry} to exist`
    );
  }

  for (const relativeImport of runtimeRelativeImports) {
    const packagedPath = resolve(PACKAGED_EXTENSION_ROOT, relativeImport.replace(/^\.\//, ""));
    assert.equal(
      existsSync(packagedPath),
      true,
      `Expected packaged runtime dependency ${relativeImport} to exist at ${packagedPath}`
    );
  }
});
