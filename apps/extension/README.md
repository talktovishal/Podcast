# ListenLater Chrome Extension (MV3)

This extension is intentionally kept in a standalone folder so you can package and publish it directly to the Chrome Web Store.

## Folder
- `apps/extension`

## Local load
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `/Users/vishalchowdhary/Documents/Podcast/apps/extension`.

## One-command package
From repo root:

```bash
npm run extension:package
```

This generates:
- `dist/extension/listenlater-capture-v<version>.zip` (upload this to Web Store)
- `dist/extension/webstore/*` (listing metadata templates)
- `dist/extension/README.txt` (quick checklist)

## Connect flow
1. Sign in to ListenLater web app (`/app`).
2. Generate a one-time connect code from the **Chrome Extension** card.
3. Open extension popup.
4. Set server URL (default `http://localhost:3000`).
5. Paste connect code and click **Connect**.
6. Click **Capture Current Page** on any HTTP/HTTPS tab.

The extension sends a raw HTML snapshot to:
- `POST /api/items/html-snapshot`

Auth exchange endpoints:
- `POST /api/auth/extension/connect-code`
- `POST /api/auth/extension/exchange`

## Private Web Store publishing
Use the checklist in:
- `docs/chrome-webstore-private-publish.md`
