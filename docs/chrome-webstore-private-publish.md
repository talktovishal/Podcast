# Chrome Web Store (Private) Publish Guide

This guide is optimized to minimize manual work.

## What is automated

The release path is now split into deterministic package gates and a packaged-build smoke check:

```bash
corepack pnpm extension:package        # run extension release checks, then build + validate the ZIP
corepack pnpm extension:smoke:package  # smoke-test the packaged artifact against a local app stack
```

`extension:package` produces:

- `dist/extension/articlepod-capture-v<version>.zip` (upload this to Web Store)
- `dist/extension/articlepod-capture-v<version>.sha256` (integrity checksum)
- `dist/extension/webstore/*` (listing text templates)
- `dist/extension/README.txt` (quick checklist)

`extension:validate` checks:

- All required source files are present
- Popup runtime module imports exist in source and the packaged build
- `manifest.json` fields are valid (manifest_version 3, name, version, description, icons)
- All icon files exist at the correct pixel dimensions (16×16 through 128×128)
- No inline `<script>` blocks or remote script references in `popup.html` (MV3 CSP)
- No `eval()` in `popup.js`
- Webstore listing text files are present and within Chrome Web Store character limits
- Built ZIP and SHA-256 checksum file exist

`extension:smoke:package` loads the packaged artifact from `dist/extension/package`, rewrites only `runtime-config.js` for the local harness target, and verifies the popup can:

- exchange a fresh connect code
- enter the connected state
- keep optional metadata collapsed by default, then remember the expanded state after the popup is reopened
- submit one real capture successfully

The smoke command targets the app's stable local fixture page at `/extension-smoke.html`, so the release gate does not depend on a third-party site behaving the same way on release day.

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
- **Reviewer credentials**: use the dedicated production reviewer login seeded from
  `APP_WEBSTORE_REVIEWER_EMAIL` and `APP_WEBSTORE_REVIEWER_PASSWORD`. Do not paste a raw connect code into the
  reviewer notes because connect codes are intentionally one-time and 24-hour scoped.

---

## Step-by-step (private for you/testers)

1. Build and validate the package:

```bash
corepack pnpm extension:release:check
```

Confirm the package step ends with **"TECHNICALLY READY"** and the packaged smoke run passes before proceeding.

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

12. Reviewer login flow:
   - Sign in to `https://articlepod.com/login` with the dedicated reviewer account.
   - Open `https://articlepod.com/app/chrome-extension`.
   - Copy the auto-prepared one-time connect code from that page and paste it into the popup.
   - After pairing once, the installed extension token remains valid until it is explicitly revoked.

---

## Local fallback (no store)

You can always run it locally without publishing:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked from `dist/extension/package` for release-candidate testing
4. Use `apps/extension` only for source-level debugging while you are still editing code

---

## Notes

- If you update extension code, rerun `corepack pnpm extension:release:check` before uploading.
- If you change permissions in `manifest.json`, Chrome Web Store may require additional review details.
- The packaged store manifest intentionally keeps broad `http://*/*` and `https://*/*` host access so Chrome does not force per-site access grants before capture.
- For unpacked local debugging against a different ArticlePod origin, update `apps/extension/runtime-config.js` before loading the extension.
- Reviewers should always log in and mint a fresh connect code from `/app/chrome-extension`; we intentionally do not maintain a permanent reusable pairing code.
