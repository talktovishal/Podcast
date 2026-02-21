# Chrome Web Store (Private) Publish Guide

This guide is optimized to minimize manual work.

## What is automated
Two commands prepare and validate everything needed from this repo:

```bash
npm run extension:package   # build the ZIP + copy webstore metadata templates
npm run extension:validate  # verify the package is Chrome Web Store ready
```

`extension:package` produces:
- `dist/extension/articlepod-capture-v<version>.zip` (upload this to Web Store)
- `dist/extension/articlepod-capture-v<version>.sha256` (integrity checksum)
- `dist/extension/webstore/*` (listing text templates)
- `dist/extension/README.txt` (quick checklist)

`extension:validate` checks:
- All required source files are present
- `manifest.json` fields are valid (manifest_version 3, name, version, description, icons)
- All icon files exist at the correct pixel dimensions (16×16 through 128×128)
- No inline `<script>` blocks or remote script references in `popup.html` (MV3 CSP)
- No `eval()` in `popup.js`
- Webstore listing text files are present and within Chrome Web Store character limits
- Built ZIP and SHA-256 checksum file exist

## What remains manual (required by Google)
- Initial Chrome Web Store developer registration and payment ($5 one-time fee).
- Creating/updating the Web Store listing.
- Choosing visibility (`Private`) and tester access.
- **Screenshots**: at least 1 screenshot at 1280×800 or 640×400 — upload in the store listing form.
- **Privacy policy URL**: publish `apps/extension/webstore/privacy-policy.md` as a public GitHub
  Gist and paste the raw URL in the store listing form.
- **Broad host permissions justification**: the extension uses `http://*/*` and `https://*/*`
  because packaged runtime config can target local/private/public ArticlePod deployments. When the
  store form asks for justification, enter: _"The extension supports local, private-test, and
  public ArticlePod deployments via packaged runtime configuration, so it must reach configured
  HTTP/HTTPS origins."_

---

## Step-by-step (private for you/testers)

1. Build and validate the package:

```bash
npm run extension:package
npm run extension:validate
```

   Confirm the output ends with **"TECHNICALLY READY"** before proceeding.

2. Capture at least one screenshot of the popup (1280×800 or 640×400).

3. Publish `apps/extension/webstore/privacy-policy.md` to a public URL.

4. Open [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

5. Create new item (or open existing item).

6. Upload ZIP:
   - Use `dist/extension/articlepod-capture-v<version>.zip`

7. Fill listing fields using templates from `dist/extension/webstore/`:
   - Short description → `listing-short-description.txt` (paste as-is)
   - Description → `listing-description.md` (remove `#` headers and `**bold**` markers — the store accepts plain text only)
   - Privacy policy → paste the hosted URL from step 3
   - Release notes → `release-notes.md` (remove `#` headers before pasting)

8. Upload your screenshots.

9. Set visibility/distribution:
   - Choose `Private`.
   - Choose `Only trusted testers`.
   - Add your own Google account (and any tester accounts).

10. Publish.

11. Install from the private listing while logged in with an allowed account.

---

## Local fallback (no store)
You can always run it locally without publishing:
1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked from `apps/extension`

---

## Notes
- If you update extension code, rerun `npm run extension:package && npm run extension:validate` before uploading.
- If you change permissions in `manifest.json`, Chrome Web Store may require additional review details.
- Server targets are configured in `apps/extension/runtime-config.js` (not entered in popup UI).
- The `host_permissions` grant (`http://*/*`, `https://*/*`) is intentional to support configured
  local/private/public deployment targets.
