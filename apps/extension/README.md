# ArticlePod Capture — Chrome Extension

A Manifest V3 Chrome extension that captures the current browser tab, safely reveals likely article content when needed, and adds it to your private ArticlePod podcast feed.

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

| Requirement               | Notes                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Node.js ≥ 18 + npm        | For the packaging and validation scripts                                                             |
| Python 3                  | For icon generation (`generate-extension-icons.py`)                                                  |
| Chrome browser            | Developer mode for local unpacked loading                                                            |
| ArticlePod server running | `https://articlepod.com` by default; local debugging can override `apps/extension/runtime-config.js` |

---

## Local debugging (Developer mode)

Use this when developing the extension or testing against a local ArticlePod server.
No Chrome Web Store account required.
This is the right path for source-code iteration, but it is not enough for release sign-off.

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

### Server target configuration (no popup URL field)

The popup no longer asks users to type a server URL.
Server targets are configured in:

`apps/extension/runtime-config.js`

Default behavior:

- `serverUrl` points to `https://articlepod.com`
- the packaged manifest keeps broad `http://*/*` + `https://*/*` host access so users can capture arbitrary pages without Chrome asking for one-time per-site access
- if you want to test against a different local/dev ArticlePod origin, temporarily change `serverUrl` before loading unpacked

---

## Connecting to your ArticlePod server

This flow works the same whether you are using the local development server or your deployed instance.

1. Sign in to the ArticlePod web app at `/app`.

2. Open the dedicated **Chrome Extension** page in the web app and click **Generate connect code**.
   The one-time code is valid for 24 hours. If you wait longer than that, it stops working and you must generate a new code.

3. Click the ArticlePod Capture icon in your Chrome toolbar.

4. In the popup:
   - Paste the **One-time connect code** from step 2.
   - Click **Connect**.

5. The popup switches to **Configured** state (blue) and shows that the extension is connected without an automatic token expiry.
   The connect-code field is hidden once connected.

6. Navigate to any HTTP/HTTPS page and click **Capture Current Page**.
   The popup keeps `Importance` and `Tags` inside a bordered optional box with a visible **Optional** badge so it is clear you can skip them.
   That optional block starts hidden by default and remembers whether you last left it expanded in the current Chrome profile.
   A small footer hyperlink labeled `articlepod.com` also opens the site directly so users always have an obvious way back to the web app.
   Optional metadata in the popup:
   - choose an **Importance** level (`Low`, `Medium`, `High`)
   - add comma-separated **Tags** such as `financial, personal, retirement`
     The extension does a bounded smart-capture pass first:
   - it can reveal likely article continuations with safe `Load more` / `Read more` style clicks
   - it can do a few bounded scroll passes for lazy-loaded content
   - it removes inert scripts, styles, templates, noscript blocks, and HTML comments before upload
   - it stays conservative on thread/feed-style hosts such as X/Twitter and Reddit
   - it leaves article-vs-block/interstitial classification to the server extraction path instead of trying to fully judge that in the popup
     When capture succeeds, the popup button stays in a green queued state and becomes non-clickable for that same page so users do not double-submit.
     The button returns to normal after you switch tabs or navigate to a different page.
     The page is queued immediately after capture; refresh your ArticlePod dashboard to see it.

### Capture size guardrail

ArticlePod still enforces a hard snapshot size limit on the server.
The extension now checks the cleaned HTML size before upload and fails early if the page is still too large after safe cleanup, instead of sending a risky partial snapshot.

### Disconnecting / rotating the token

Click **Disconnect** in the popup at any time.
To reconnect, generate a new connect code from the web app and repeat the steps above.

---

## Building the package

Run this from the repo root for a release candidate package:

```bash
corepack pnpm extension:package
```

`extension:package` produces:

| File                                                  | Purpose                           |
| ----------------------------------------------------- | --------------------------------- |
| `dist/extension/articlepod-capture-v<version>.zip`    | Upload this to Chrome Web Store   |
| `dist/extension/articlepod-capture-v<version>.sha256` | Integrity checksum                |
| `dist/extension/webstore/`                            | Pre-filled listing text templates |
| `dist/extension/README.txt`                           | Quick checklist                   |

`extension:package` now runs extension-specific release gates before it leaves behind a ZIP:

- core extension capture tests
- web auth/exchange integration tests that cover connect-code and snapshot submission
- live-site extension harness tests, including packaged-artifact dependency checks
- package build + packaged-artifact validation

If you only want the low-level ZIP builder without the release checks, use:

```bash
corepack pnpm extension:package:raw
```

**Always confirm the output ends with `TECHNICALLY READY` before uploading.**

### Release-candidate testing

Do not rely on `apps/extension` alone when you are about to upload or publish.

1. Run the full release gate:

   ```bash
   corepack pnpm extension:release:check
   ```

   This runs the packaged smoke flow against the app's stable local fixture page at `/extension-smoke.html`, so the release gate does not depend on a third-party site staying unchanged.
   The packaged smoke now also proves the popup metadata block starts collapsed, can be expanded, and stays expanded after reopening the popup in the same Chrome profile.

2. If you want a manual local install before Web Store upload, open `chrome://extensions`, enable **Developer mode**, and load unpacked from:

   ```text
   <repo-root>/dist/extension/package
   ```

3. Generate a fresh connect code from `/app/chrome-extension`, connect the packaged popup, and submit one real capture.

4. After the store updates, repeat one human smoke test from the actual store-installed extension before calling the release done.

Use `apps/extension` for development. Use `dist/extension/package` or the actual store listing for release confidence.

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

Recommended approach:

- **GitHub Gist**: create a public gist, paste the contents of
  `apps/extension/webstore/privacy-policy.md`, and use the raw URL (click **Raw** on the Gist
  page to get a permanent `https://gist.githubusercontent.com/…/raw/…` URL).

Copy the public URL — you will paste it in the listing form.

#### b) Screenshots

The store requires at least **one screenshot** at exactly **1280×800 or 640×400** pixels.

Suggested screenshots to take:

1. The popup in its unconfigured state (white, connect-code visible).
2. The popup in configured state (blue) after a successful capture.

> In Chrome, you can use DevTools → device toolbar (Ctrl+Shift+M / Cmd+Shift+M) set to a custom
> 640×400 viewport, or take a full-screen shot and crop to 1280×800.

### Upload and publish

1. Build and validate:

   ```bash
   corepack pnpm extension:release:check
   ```

   Confirm the package step ends with **"TECHNICALLY READY"** and the packaged smoke run passes.

2. Open <https://chrome.google.com/webstore/devconsole> and click **New item** (or open an existing draft).

3. Upload the ZIP:
   - Use `dist/extension/articlepod-capture-v<version>.zip`

4. Fill in the listing fields using the pre-filled templates from `dist/extension/webstore/`:

   | Store field          | Template file                       | Note                                                                                                               |
   | -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
   | Short description    | `listing-short-description.txt`     | Paste as-is                                                                                                        |
   | Detailed description | `listing-description.md`            | Plain text only — remove the `#` headers and `**bold**` markers before pasting; the store does not render Markdown |
   | Privacy policy URL   | hosted URL from the prep step above |                                                                                                                    |
   | Release notes        | `release-notes.md`                  | Remove `#` headers before pasting                                                                                  |

5. Upload your screenshots.

6. In the Chrome Web Store permissions justification field, explain:

   > ArticlePod Capture is a user-invoked tool that must read the current HTTP/HTTPS page to capture it into the user's private podcast queue. The packaged popup still sends captures only to ArticlePod.

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
2. Bump `version` in `apps/extension/manifest.json` (e.g. `"0.1.3"` → `"0.1.4"`).
3. Update `apps/extension/webstore/release-notes.md` with a summary of what changed.
4. Rebuild and validate:

   ```bash
   corepack pnpm extension:release:check
   ```

5. In the Chrome Web Store Developer Dashboard, open your existing listing and click **Upload new package**.
6. Upload `dist/extension/articlepod-capture-v<new-version>.zip`.
7. Save and re-publish.

---

## Extension API reference

The extension communicates with these ArticlePod API endpoints:

| Method | Path                               | Purpose                                                                     |
| ------ | ---------------------------------- | --------------------------------------------------------------------------- |
| `POST` | `/api/auth/extension/connect-code` | Generate a one-time connect code (24-hour default, called from the web app) |
| `POST` | `/api/auth/extension/exchange`     | Exchange connect code for an extension token that stays valid until revoked |
| `POST` | `/api/items/html-snapshot`         | Submit a captured page HTML snapshot                                        |

Authentication uses a scoped **extension token** (Bearer) obtained during the connect flow.
Tokens can be rotated or revoked from the web app at any time.
