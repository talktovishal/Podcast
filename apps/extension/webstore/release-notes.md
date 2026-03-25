# Release Notes

## v0.1.5
- Added a small footer link in the popup so users can jump back to `articlepod.com` without guessing where to go next.
- Simplified the popup footer link to a plain `articlepod.com` hyperlink and styled it more clearly as a clickable website link.
- Narrowed the extension package to the production `https://articlepod.com` origin so Chrome Web Store review sees a least-privilege host permission scope.

## v0.1.4
- Added bounded smart capture that can reveal likely article content with safe load-more clicks and limited scrolling.
- Capture now removes inert scripts, styles, templates, noscript blocks, and HTML comments before upload while preserving document structure for server extraction.
- Oversized pages now fail early in the popup when safe cleanup still exceeds the snapshot budget.

## v0.1.1
- Removed server URL input from popup (server targets now come from packaged runtime config).
- Added connected-state UX: popup turns blue when configured and hides connect-code input.
- Added capture-start feedback and toolbar badge state updates.

## v0.1.0
- Initial Chrome extension release.
- One-time connect code exchange.
- Capture active tab HTML and submit to ArticlePod.
