This directory vendors `default-stylesheet.css` from `jsdom@29.0.1`.

Why it exists:
- Next's server bundle resolves `jsdom`'s default stylesheet relative to the
  built app directory during `next build`.
- Without this file at `apps/web/browser/default-stylesheet.css`, the build
  fails while collecting page data.

When updating `jsdom`, refresh this file from:
- `node_modules/.pnpm/jsdom@<version>/node_modules/jsdom/lib/jsdom/browser/default-stylesheet.css`
