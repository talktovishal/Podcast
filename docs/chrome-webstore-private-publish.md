# Chrome Web Store (Private) Publish Guide

This guide is optimized to minimize manual work.

## What is automated
One command prepares everything needed from this repo:

```bash
npm run extension:package
```

It produces:
- `dist/extension/articlepod-capture-v<version>.zip` (extension package)
- `dist/extension/webstore/*` (listing text templates)
- `dist/extension/README.txt` (quick checklist)

## What remains manual (required by Google)
- Initial Chrome Web Store developer registration and payment.
- Creating/updating the Web Store listing.
- Choosing visibility (`Private`) and tester access.

---

## Step-by-step (private for you/testers)

1. Build package artifacts:
- Run `npm run extension:package`

2. Open Chrome Web Store Developer Dashboard.

3. Create new item (or open existing item).

4. Upload ZIP:
- Use `dist/extension/articlepod-capture-v<version>.zip`

5. Fill listing fields quickly using templates:
- `dist/extension/webstore/listing-short-description.txt`
- `dist/extension/webstore/listing-description.md`
- `dist/extension/webstore/privacy-policy.md`
- `dist/extension/webstore/release-notes.md`

6. Set visibility/distribution:
- Choose `Private`.
- Choose `Only trusted testers`.
- Add your own Google account (and any tester accounts).

7. Publish.

8. Install from private listing while logged in with an allowed account.

---

## Local fallback (no store)
You can always run it locally without publishing:
1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked from `apps/extension`

---

## Notes
- If you update extension code, rerun `npm run extension:package` before uploading.
- If you change permissions in `manifest.json`, Chrome Web Store may require additional review details.
