# Release Checklist

## Goal
Ensure every release candidate meets RSS/media compatibility, security, and demo-readiness expectations before shipping.

## Automated gates (required)
1. `corepack pnpm lint`
2. `corepack pnpm test`
3. `corepack pnpm build`
4. `corepack pnpm export`
5. `corepack pnpm license:check`
6. `./scripts/verify_podcast_contract.sh "<FEED_URL>"`
7. `npm run live-sites:test -- --env local`

Default output:
- `exports/live-site-validation/<timestamp>/summary.md`
- `exports/live-site-validation/<timestamp>/failures.md`
- `exports/live-site-validation/<timestamp>/results.json`

## Manual smoke protocol (required)
1. Subscribe to `<FEED_URL>` in Apple Podcasts (or Apple Podcasts Preview on iOS/macOS reachable host).
2. Subscribe to the same feed in one secondary app (for example Overcast, Pocket Casts, or Castro).
3. Validate in both apps:
   - feed appears and updates
   - episode starts playback
   - seek/skip works (range requests)
   - resume works after pausing
4. Validate extension capture flow:
   - connect extension
   - submit snapshot
   - item appears immediately in dashboard as queued/processing
   - item reaches ready and plays
5. If GitHub CLI auth is configured, run the prod-probe leg as well:
   - `npm run live-sites:test`

## Evidence template
- Release candidate:
- Date:
- Operator:
- Feed URL used:
- Automated gates result:
- Live-site local result:
- Live-site prod-probe result:
- Apple Podcasts result:
- Secondary app result:
- Extension flow result:
- Notes/blockers:
- Final sign-off (`PASS`/`BLOCKED`):

## Latest local evidence (2026-02-14)
- `./scripts/verify_podcast_contract.sh "http://localhost:3000/rss/5OZV8xtOGO1yXGMRx01m_kc6eNSGlRYnyzyZJ8tcZYs.xml"` passed with:
  - feed `HEAD` 200
  - media `HEAD` 200
  - range `206`
