# ArticlePod Capture — Chrome Extension

A Manifest V3 Chrome extension that captures the current browser tab and adds it to your private ArticlePod podcast feed.

---

## Contents

- [Prerequisites](#prerequisites)
- [Local debugging (Developer mode)](#local-debugging-developer-mode)
- [Connecting to your ArticlePod server](#connecting-to-your-articlepod-server)
- [Building the package](#building-the-package)
- [Publishing to Chrome Web Store](#publishing-to-chrome-web-store)
- [Updating an existing listing](#updating-an-existing-listing)
- [Extension API reference](#extension-api-reference)

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js ≥ 18 + npm | For the packaging and validation scripts |
| Python 3 | For icon generation (`generate-extension-icons.py`) |
| Chrome browser | Developer mode for local unpacked loading |
| ArticlePod server running | Local (`http://localhost:3000`) or your deployed URL |

---

## Local debugging (Developer mode)

Use this when developing the extension or testing against a local ArticlePod server.
No Chrome Web Store account required.

1. From the repo root, generate the icons (one-time):

   ```bash
   npm run extension:icons
   ```

2. Open `chrome://extensions` in Chrome.

3. Enable **Developer mode** (toggle in the top-right corner).

4. Click **Load unpacked**.

5. Select the folder:

   ```
   <repo-root>/apps/extension
   ```

   For example, if the repo is at `/Users/you/Podcast`:

   ```
   /Users/you/Podcast/apps/extension
   ```

6. The **ArticlePod Capture** extension now appears in your toolbar.

7. To reload after making code changes: click the **⟳** refresh icon on the extension card in `chrome://extensions`.

> **Tip:** Pin the extension to your toolbar by clicking the puzzle-piece icon in Chrome and pinning ArticlePod Capture.

---

## Connecting to your ArticlePod server

This flow works the same whether you are using the local development server or your deployed instance.

1. Sign in to the ArticlePod web app at `/app`.

2. Open **Settings → Chrome Extension** and click **Generate connect code**.
   The code expires in a few minutes — copy it right away.

3. Click the ArticlePod Capture icon in your Chrome toolbar.

4. In the popup:
   - **Server URL**: enter your server address.
     - Local dev: `http://localhost:3000`
     - Deployed: `https://your-articlepod-domain.com`
   - **One-time connect code**: paste the code from step 2.
   - Click **Connect**.

5. The popup shows **"Connected. Token expires: …"** — you are ready.

6. Navigate to any HTTP/HTTPS page and click **Capture Current Page**.
   The page is queued immediately; refresh your ArticlePod dashboard to see it.

### Disconnecting / rotating the token

Click **Disconnect** in the popup at any time.
To reconnect, generate a new connect code from the web app and repeat the steps above.

---

## Building the package

Run both commands from the repo root:

```bash
npm run extension:package   # build the ZIP + copy listing templates
npm run extension:validate  # verify the package is Chrome Web Store ready
```

`extension:package` produces:

| File | Purpose |
|---|---|
| `dist/extension/articlepod-capture-v<version>.zip` | Upload this to Chrome Web Store |
| `dist/extension/articlepod-capture-v<version>.sha256` | Integrity checksum |
| `dist/extension/webstore/` | Pre-filled listing text templates |
| `dist/extension/README.txt` | Quick checklist |

`extension:validate` checks all technical Chrome Web Store requirements (manifest fields, icon dimensions, CSP compliance, listing character limits) and exits non-zero if anything is wrong.

**Always confirm the output ends with `TECHNICALLY READY` before uploading.**

---

## Publishing to Chrome Web Store

### One-time account setup (do this once)

1. Go to <https://chrome.google.com/webstore/devconsole>.
2. Sign in with your Google account.
3. Pay the **one-time $5 developer registration fee**.
4. Accept the developer agreement.

### Prepare the listing assets (before your first upload)

#### a) Privacy policy

The Chrome Web Store requires a publicly reachable privacy policy URL.

Recommended approaches:
- **Hosted on your ArticlePod deployment**: add a `/privacy` route that renders
  `apps/extension/webstore/privacy-policy.md`.
- **GitHub Gist**: create a public gist, paste the contents of
  `apps/extension/webstore/privacy-policy.md`, and use the raw URL.

Copy the public URL — you will paste it in the listing form.

#### b) Screenshots

The store requires at least **one screenshot** at exactly **1280×800 or 640×400** pixels.

Suggested screenshots to take:
1. The popup in its unconnected state (showing the connect form).
2. The popup after a successful capture (showing the success message).

> In Chrome, you can use DevTools → device toolbar (Ctrl+Shift+M / Cmd+Shift+M) set to a custom
> 400×640 viewport, or take a full-screen shot and crop to 1280×800.

### Upload and publish

1. Build and validate:

   ```bash
   npm run extension:package
   npm run extension:validate
   ```

   Confirm output ends with **"TECHNICALLY READY"**.

2. Open <https://chrome.google.com/webstore/devconsole> and click **New item** (or open an existing draft).

3. Upload the ZIP:
   - Use `dist/extension/articlepod-capture-v<version>.zip`

4. Fill in the listing fields using the pre-filled templates from `dist/extension/webstore/`:

   | Store field | Template file |
   |---|---|
   | Short description | `listing-short-description.txt` |
   | Detailed description | `listing-description.md` |
   | Privacy policy URL | hosted URL from the prep step above |
   | Release notes | `release-notes.md` |

5. Upload your screenshots.

6. In the **Justify your permissions** field (shown because of the broad `host_permissions`), enter:

   > Users configure a custom ArticlePod server URL; the extension must be able to reach any HTTP or HTTPS origin they configure.

7. Set visibility and distribution:
   - **Visibility**: `Private`
   - **Distribution**: `Only trusted testers`
   - Add your Google account (and any tester Google accounts).

8. Click **Publish**.

9. Wait for review (usually minutes for private listings).

10. Install from the private listing while signed in with an allowed Google account.

### Making the extension public (optional)

To allow anyone to install the extension from the store:
- Change **Visibility** to `Public` in the listing settings.
- Re-submit for review.

---

## Updating an existing listing

1. Make your code changes in `apps/extension/`.
2. Bump `version` in `apps/extension/manifest.json` (e.g. `"0.1.0"` → `"0.2.0"`).
3. Update `apps/extension/webstore/release-notes.md` with a summary of what changed.
4. Rebuild and validate:

   ```bash
   npm run extension:package
   npm run extension:validate
   ```

5. In the Chrome Web Store Developer Dashboard, open your existing listing and click **Upload new package**.
6. Upload `dist/extension/articlepod-capture-v<new-version>.zip`.
7. Save and re-publish.

---

## Extension API reference

The extension communicates with these ArticlePod API endpoints:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/extension/connect-code` | Generate a one-time connect code (called from the web app) |
| `POST` | `/api/auth/extension/exchange` | Exchange connect code for an extension token |
| `POST` | `/api/items/html-snapshot` | Submit a captured page HTML snapshot |

Authentication uses a scoped **extension token** (Bearer) obtained during the connect flow.
Tokens can be rotated or revoked from the web app at any time.

