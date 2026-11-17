# ArticlePod Capture

Turn any page you are currently viewing into a private podcast episode in your ArticlePod account.

## How it works
1. Connect the extension with a one-time code from ArticlePod web app.
2. Click **Capture Current Page**.
3. The extension does a bounded smart-capture pass to reveal likely article content, then sends a cleaned HTML snapshot to your account.
4. ArticlePod processes it and adds the episode to your private RSS feed.

## Why this is useful
- Works for pages you can see in your browser session.
- Helpful for authenticated pages where URL-only fetch may fail.
- Fast capture flow directly from your active tab.
- Safe cleanup removes inert scripts, styles, templates, noscript blocks, and HTML comments before upload.
- Conservative handling avoids aggressive thread expansion on feed-style hosts.

## Privacy and security
- Extension auth uses scoped extension tokens.
- Tokens can be rotated/revoked from the app workflow.
- Captured pages are sent only to `https://articlepod.com`.
