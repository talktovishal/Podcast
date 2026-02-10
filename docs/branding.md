# Branding Source Of Truth

Project brand is now **ArticlePod**.

## Primary constant
- Use `/Users/vishalchowdhary/Documents/Podcast/packages/core/src/config/brand.ts` as the single source for:
  - `BRAND_NAME`
  - `BRAND_SLUG`
  - default demo/admin emails
  - branded bot/snapshot defaults

## Rule for future rename
- Update `packages/core/src/config/brand.ts` first.
- Then run a quick grep for hardcoded brand text in static assets that cannot import TS constants:
  - `/Users/vishalchowdhary/Documents/Podcast/apps/extension/manifest.json`
  - `/Users/vishalchowdhary/Documents/Podcast/apps/extension/popup.html`
  - `/Users/vishalchowdhary/Documents/Podcast/apps/extension/webstore/*`
