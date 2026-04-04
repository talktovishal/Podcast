# Live Site Regression Harness

This harness runs a reusable business-heavy live-site suite against:

- your checked-out latest local ArticlePod code
- the checked-in Chrome extension code under `apps/extension`
- optional production VM URL probes via GitHub Actions

## Files

- `corpus.md` — the only file you edit to change the default target URLs
- `quirks.md` — site-specific behavior notes that should not become code hacks
- `src/` — parser, runners, reporting, and CLI
- `tests/` — lightweight parser/reporting/popup-hook tests

## Commands

From the repo root:

```bash
npm run live-sites:test
npm run live-sites:test -- --env local
npm run live-sites:test -- --site reuters-world,cnbc-business --mode url
npm run live-sites:test:extension -- --limit 2
npm run live-sites:test:extension -- --limit 1 --extension-build package
npm run live-sites:test:prod-probe -- --site reuters-world
```

Defaults:

- `npm run live-sites:test`
  - runs local URL + extension validation
  - then dispatches production VM URL probes for URL-capable targets
- `APP_URL` is used if already reachable
- otherwise the harness boots the parity stack with the existing scripts

## Prerequisites

- `pnpm install`
- Playwright Chromium installed for extension/browser capture paths:

  ```bash
  npx playwright install chromium
  ```

- demo credentials available through `.env` / parity env
- `gh auth status` configured if you want prod probes

## Output

Every run writes a timestamped bundle to:

```text
exports/live-site-validation/<timestamp>/
```

Artifacts include:

- `summary.md`
- `results.json`
- `failures.md`
- downloaded prod-probe artifacts when available
- failure screenshots for extension/browser paths when available

## Fix Loop

1. Run the suite.
2. Read `failures.md`.
3. Fix deterministic product or harness regressions only.
4. Rerun the impacted subset with `--site ...`.
5. Rerun the full suite before closing the change.

If the site itself changed, update `corpus.md` or `quirks.md` first. Do not hardcode a site-specific patch unless the product behavior is genuinely wrong.

## Checked-In Extension Versus Web Store

By default, this harness tests the latest checked-in extension code from `apps/extension`, not the Chrome Web Store build.

For smoke coverage, the harness creates a temporary unpacked extension copy and rewrites only `runtime-config.js` so it points at the current local app URL. In default mode that keeps the code under test aligned with the repo while still exercising the real popup/connect/capture flow.

For release-candidate testing, pass `--extension-build package` so the smoke step copies from `dist/extension/package` instead of `apps/extension`.
This is the mode used by `corepack pnpm extension:smoke:package`.
The dedicated packaged-smoke script targets the app's local `/extension-smoke.html` fixture rather than a third-party corpus URL.

Release rule:
- use `apps/extension` while you are developing
- use `dist/extension/package` or the actual Chrome Web Store listing when you are deciding whether a release is safe
