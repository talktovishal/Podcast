# Release Notes

## v0.1.9

- Fixed right-click snippet saves on pages with very long titles, including X/Twitter posts, by normalizing snippet titles and rich capture metadata before submit.
- Kept rich selection/context capture bounded to the server contract so large social-page DOMs do not turn into generic save failures.

## v0.1.8

- Added a lightweight in-page toast for right-click instant snippet saves so users can see saving, saved, and reconnect/failure states without opening a popup.
- Expanded packaged-extension validation so background snippet runtime files are included before release upload.

## v0.1.7

- Made the popup's optional capture details start collapsed by default and remember the user's last expanded state in the current Chrome profile.
- Added packaged-extension smoke coverage so release builds must prove the optional details panel behaves correctly after reopening the popup.

## v0.1.6

- Fixed the Chrome Web Store package so the popup includes all runtime modules required for connect and capture actions.
- Added packaging validation for popup module dependencies to catch missing files before upload.

## v0.1.5

- Added a small footer link in the popup so users can jump back to `articlepod.com` without guessing where to go next.
- Simplified the popup footer link to a plain `articlepod.com` hyperlink and styled it more clearly as a clickable website link.
- Restored broad HTTP/HTTPS host permissions so Chrome does not force a separate per-site access grant before capture.

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
