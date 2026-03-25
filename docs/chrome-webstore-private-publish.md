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
- **Permissions justification**: the extension keeps broad `http://*/*` and `https://*/*`
  host access so users can capture arbitrary pages without Chrome's extra per-site access prompt.
  When the store form asks for justification, enter: _"ArticlePod Capture is a user-invoked tool
  that must read the current HTTP/HTTPS page to capture it into the user's private podcast queue.
  The packaged popup still sends captures only to ArticlePod."_

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
- The packaged store manifest intentionally keeps broad `http://*/*` and `https://*/*` host access so Chrome does not force per-site access grants before capture.
- For unpacked local debugging against a different ArticlePod origin, update `apps/extension/runtime-config.js` before loading the extension.
