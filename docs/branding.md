# Branding Source Of Truth

Project brand is now **ArticlePod**.

## Canonical Source
- Use `/Users/vishalchowdhary/Documents/Podcast/config/naming.json` as the single source for:
  - brand name/slug
  - package scope and legacy scope
  - auth cookie names and legacy cookie names
  - extension storage keys and legacy keys
  - Azure runtime identity (user/group/paths/service prefix)
  - infra naming defaults

## Generated Constants
- Run `npm run naming:sync` to update generated files:
  - `/Users/vishalchowdhary/Documents/Podcast/packages/core/src/config/brand.ts`
  - `/Users/vishalchowdhary/Documents/Podcast/packages/core/src/config/naming.ts`
  - `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/runtime-naming.sh`

## Validation Gate
- Run `npm run naming:check` to ensure:
  - generated naming files are in sync
  - non-allowlisted legacy identifier references are blocked

## Static Assets
- Static assets that cannot import TS constants still require manual updates after rename:
  - `/Users/vishalchowdhary/Documents/Podcast/apps/extension/manifest.json`
  - `/Users/vishalchowdhary/Documents/Podcast/apps/extension/popup.html`
  - `/Users/vishalchowdhary/Documents/Podcast/apps/extension/webstore/*`

## Legacy Compatibility Notes
- Temporary legacy compatibility references are tracked in:
  - `/Users/vishalchowdhary/Documents/Podcast/config/naming-legacy-allowlist.txt`
- Existing Azure VM runtimes can be migrated with:
  - `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/migrate-runtime-naming.sh`

## Runtime Defaults
- Use `/Users/vishalchowdhary/Documents/Podcast/packages/core/src/config/brand.ts` for:
  - `BRAND_NAME`
  - `BRAND_SLUG`
  - default demo/admin emails
  - branded bot/snapshot defaults
