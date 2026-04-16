#!/usr/bin/env node
/**
 * Validate the Chrome extension package against Chrome Web Store technical
 * requirements before submission.
 *
 * Usage:
 *   node scripts/validate-extension.mjs          # validate source tree
 *   node scripts/validate-extension.mjs --zip    # validate built ZIP too
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const EXT_DIR = path.join(ROOT, "apps", "extension");
const DIST_DIR = path.join(ROOT, "dist", "extension");

const REQUIRED_FILES = [
  "manifest.json",
  "popup.html",
  "runtime-config.js",
  "popup.js",
  "capture-page.mjs",
  "pdf-capture.mjs",
  "target-tab.mjs",
  "popup.css",
];
const REQUIRED_ICONS = [16, 32, 48, 128];

// Chrome Web Store caps short description at 132 chars.
const SHORT_DESCRIPTION_MAX = 132;

// Chrome Web Store caps description at 16 384 chars.
const DESCRIPTION_MAX = 16384;

const args = process.argv.slice(2);
const checkZip = args.includes("--zip");

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(`  ✗ ${msg}`);
}

function warn(msg) {
  warnings.push(`  ⚠ ${msg}`);
}

function pass(msg) {
  process.stdout.write(`  ✓ ${msg}\n`);
}

function extractRelativeImports(source) {
  const matches = source.matchAll(/from\s+["'](\.\/[^"']+)["']/g);
  return [...new Set(Array.from(matches, (match) => match[1] || ""))].sort();
}

// ---------------------------------------------------------------------------
// 1. Required source files
// ---------------------------------------------------------------------------
console.log("\n[1/6] Required source files");
for (const file of REQUIRED_FILES) {
  const abs = path.join(EXT_DIR, file);
  if (fs.existsSync(abs)) {
    pass(file);
  } else {
    fail(`Missing required file: apps/extension/${file}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Manifest validation
// ---------------------------------------------------------------------------
console.log("\n[2/6] manifest.json");
let manifest = null;
try {
  manifest = JSON.parse(
    fs.readFileSync(path.join(EXT_DIR, "manifest.json"), "utf8"),
  );
} catch {
  fail("Could not parse manifest.json");
}

if (manifest) {
  if (manifest.manifest_version === 3) {
    pass(`manifest_version: ${manifest.manifest_version}`);
  } else {
    fail(`manifest_version must be 3, got: ${manifest.manifest_version}`);
  }

  if (manifest.name && manifest.name.trim().length > 0) {
    pass(`name: "${manifest.name}"`);
  } else {
    fail("manifest.name is missing or empty");
  }

  if (manifest.version && /^\d+(\.\d+)*$/.test(manifest.version)) {
    pass(`version: ${manifest.version}`);
  } else {
    fail(
      `manifest.version must be a dotted numeric string, got: ${manifest.version}`,
    );
  }

  if (manifest.description && manifest.description.trim().length > 0) {
    if (manifest.description.length > SHORT_DESCRIPTION_MAX) {
      fail(
        `manifest.description exceeds ${SHORT_DESCRIPTION_MAX} chars (${manifest.description.length}); Chrome Web Store will truncate it`,
      );
    } else {
      pass(
        `description: "${manifest.description}" (${manifest.description.length} chars)`,
      );
    }
  } else {
    fail("manifest.description is missing or empty");
  }

  // Icons declared in manifest
  const declaredIcons = manifest.icons || {};
  for (const size of REQUIRED_ICONS) {
    if (declaredIcons[String(size)]) {
      pass(`manifest.icons[${size}]: ${declaredIcons[String(size)]}`);
    } else {
      fail(`manifest.icons is missing size ${size}`);
    }
  }

  // This extension intentionally needs broad HTTP/HTTPS host access so users can
  // capture arbitrary current pages without Chrome's extra per-site access flow.
  const hp = manifest.host_permissions || [];
  const expectedHostPermissions = ["http://*/*", "https://*/*"];
  const broad = hp.filter(
    (p) =>
      p === "<all_urls>" ||
      /^\*:\/\/\*\/\*/.test(p) ||
      /^https?:\/\/\*\/\*/.test(p),
  );
  if (JSON.stringify(hp) === JSON.stringify(expectedHostPermissions)) {
    pass("host_permissions match the expected arbitrary-site capture scope");
    warn(
      "host_permissions are intentionally broad to support capture on arbitrary HTTP/HTTPS pages. " +
        "Chrome Web Store review may ask for a justification.",
    );
  } else if (broad.length > 0) {
    fail(
      `host_permissions includes broad patterns (${broad.join(", ")}). ` +
        `They must exactly match ${expectedHostPermissions.join(", ")} for the current capture UX.`,
    );
  } else {
    fail(
      `host_permissions must be ${expectedHostPermissions.join(", ")} for the current arbitrary-site capture UX, got: ${hp.join(", ")}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Icon files
// ---------------------------------------------------------------------------
console.log("\n[3/6] Icon files");

function readPngSize(filePath) {
  const buf = fs.readFileSync(filePath);
  // PNG signature: 8 bytes; IHDR chunk: 4 length + 4 type + 4 width + 4 height
  if (buf.length < 24) return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { w, h };
}

for (const size of REQUIRED_ICONS) {
  const iconPath = path.join(EXT_DIR, "icons", `icon${size}.png`);
  if (!fs.existsSync(iconPath)) {
    fail(`Missing icon: icons/icon${size}.png`);
    continue;
  }
  const dims = readPngSize(iconPath);
  if (!dims) {
    fail(`icon${size}.png: could not read PNG dimensions`);
  } else if (dims.w !== size || dims.h !== size) {
    fail(`icon${size}.png: expected ${size}×${size}, got ${dims.w}×${dims.h}`);
  } else {
    pass(`icon${size}.png: ${dims.w}×${dims.h}`);
  }
}

// ---------------------------------------------------------------------------
// 4. No remote code / no inline scripts in popup.html
// ---------------------------------------------------------------------------
console.log("\n[4/6] Content Security Policy compliance");

const popupHtml = fs.readFileSync(path.join(EXT_DIR, "popup.html"), "utf8");
const inlineScriptRe = /<script(?![^>]*\bsrc\b)[^>]*>[\s\S]*?<\/script>/i;
if (inlineScriptRe.test(popupHtml)) {
  fail("popup.html contains inline <script> block (violates MV3 CSP)");
} else {
  pass("popup.html: no inline scripts");
}

const remoteScriptRe = /<script[^>]+src=["']https?:/i;
if (remoteScriptRe.test(popupHtml)) {
  fail(
    "popup.html loads a remote script (violates Chrome Web Store remote code policy)",
  );
} else {
  pass("popup.html: no remote scripts");
}

const popupJs = fs.readFileSync(path.join(EXT_DIR, "popup.js"), "utf8");
if (/\beval\s*\(/.test(popupJs)) {
  fail("popup.js uses eval() (violates MV3 CSP)");
} else {
  pass("popup.js: no eval()");
}

const popupRelativeImports = extractRelativeImports(popupJs);
if (popupRelativeImports.length === 0) {
  warn("popup.js does not declare any relative imports");
} else {
  for (const relativeImport of popupRelativeImports) {
    const importPath = path.join(EXT_DIR, relativeImport.replace(/^\.\//, ""));
    if (fs.existsSync(importPath)) {
      pass(`popup.js import present: ${relativeImport}`);
    } else {
      fail(`popup.js imports missing file: ${relativeImport}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Webstore listing metadata
// ---------------------------------------------------------------------------
console.log("\n[5/6] Webstore listing metadata");

const webstoreDir = path.join(EXT_DIR, "webstore");
const shortDescFile = path.join(webstoreDir, "listing-short-description.txt");
const descFile = path.join(webstoreDir, "listing-description.md");
const privacyFile = path.join(webstoreDir, "privacy-policy.md");
const releaseNotesFile = path.join(webstoreDir, "release-notes.md");

if (fs.existsSync(shortDescFile)) {
  const sd = fs.readFileSync(shortDescFile, "utf8").trim();
  if (sd.length === 0) {
    fail("listing-short-description.txt is empty");
  } else if (sd.length > SHORT_DESCRIPTION_MAX) {
    fail(
      `listing-short-description.txt exceeds ${SHORT_DESCRIPTION_MAX} chars (${sd.length})`,
    );
  } else {
    pass(`listing-short-description.txt: ${sd.length} chars`);
  }
} else {
  fail("Missing webstore/listing-short-description.txt");
}

if (fs.existsSync(descFile)) {
  const desc = fs.readFileSync(descFile, "utf8").trim();
  if (desc.length === 0) {
    fail("listing-description.md is empty");
  } else if (desc.length > DESCRIPTION_MAX) {
    fail(
      `listing-description.md exceeds ${DESCRIPTION_MAX} chars (${desc.length})`,
    );
  } else {
    pass(`listing-description.md: ${desc.length} chars`);
  }
} else {
  fail("Missing webstore/listing-description.md");
}

if (fs.existsSync(privacyFile)) {
  pass("privacy-policy.md present");
  warn(
    "privacy-policy.md must be published at a publicly reachable URL before submitting to Chrome Web Store. " +
      "Host it (e.g. in your ArticlePod app or a public gist) and paste the URL in the store listing form.",
  );
} else {
  fail("Missing webstore/privacy-policy.md");
}

if (fs.existsSync(releaseNotesFile)) {
  pass("release-notes.md present");
} else {
  warn(
    "webstore/release-notes.md not found — optional but useful for store reviewers",
  );
}

warn(
  "Screenshots are required by Chrome Web Store (at least 1, size 1280×800 or 640×400). " +
    "Capture screenshots of the extension popup and add them manually in the store listing form.",
);

// ---------------------------------------------------------------------------
// 6. Built ZIP (optional)
// ---------------------------------------------------------------------------
console.log("\n[6/6] Built ZIP artifact");

let manifestVersion = manifest?.version;
if (checkZip && manifestVersion) {
  const zipPath = path.join(
    DIST_DIR,
    `articlepod-capture-v${manifestVersion}.zip`,
  );
  if (fs.existsSync(zipPath)) {
    const stat = fs.statSync(zipPath);
    pass(
      `ZIP exists: dist/extension/articlepod-capture-v${manifestVersion}.zip (${(stat.size / 1024).toFixed(1)} KB)`,
    );

    const packageDir = path.join(DIST_DIR, "package");
    if (fs.existsSync(packageDir)) {
      pass("Packaged extension directory present");
      for (const relativeImport of popupRelativeImports) {
        const packagedImportPath = path.join(
          packageDir,
          relativeImport.replace(/^\.\//, ""),
        );
        if (fs.existsSync(packagedImportPath)) {
          pass(`Packaged popup dependency present: ${relativeImport}`);
        } else {
          fail(`Packaged popup dependency missing: ${relativeImport}`);
        }
      }
    } else {
      warn(
        "dist/extension/package not found — packaged dependency verification skipped",
      );
    }

    const sha256File = path.join(
      DIST_DIR,
      `articlepod-capture-v${manifestVersion}.sha256`,
    );
    if (fs.existsSync(sha256File)) {
      pass("SHA-256 checksum file present");
    } else {
      warn(
        "SHA-256 checksum file not found — run npm run extension:package to regenerate",
      );
    }
  } else {
    fail(
      `ZIP not found: dist/extension/articlepod-capture-v${manifestVersion}.zip — run npm run extension:package first`,
    );
  }
} else if (checkZip) {
  warn("Could not determine manifest version; skipping ZIP check");
} else {
  pass("Skipping ZIP check (pass --zip to include)");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("\n─────────────────────────────────────────────────────────────");

if (warnings.length > 0) {
  console.log("\nWarnings (manual steps required for Web Store submission):");
  for (const w of warnings) {
    console.log(w);
  }
}

if (errors.length > 0) {
  console.log("\nErrors (must fix before submitting to Chrome Web Store):");
  for (const e of errors) {
    console.log(e);
  }
  console.log("\nResult: NOT READY — fix the errors above, then re-run.\n");
  process.exit(1);
} else {
  console.log(
    "\nResult: TECHNICALLY READY — the extension package passes all automated checks.\n" +
      "        Complete the manual steps listed in the warnings above to finish the Web Store submission.\n" +
      "        See docs/chrome-webstore-private-publish.md for step-by-step instructions.\n",
  );
}
