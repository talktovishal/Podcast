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
5. Validate Stripe billing in staging before any live-key rollout:
   - checkout purchase succeeds for `Pro monthly` and `Pro annual`
   - `/app/settings` shows pending activation until webhook confirmation
   - `invoice.paid` or equivalent renewal path extends access correctly
   - Customer Portal opens and supports payment update, invoice history, and cancel-at-period-end behavior
   - payment failure and action-required scenarios show recovery messaging instead of granting access from redirect alone
   - admin support can find Stripe customer/subscription/invoice links for the staged account
6. Confirm founder/operator launch blockers are closed:
   - Stripe business verification complete
   - bank account connected
   - monthly and annual recurring prices created in live mode
   - portal configured
   - retry/email settings configured
   - branding configured
   - Stripe Tax decision explicitly made
7. If GitHub CLI auth is configured, run the prod-probe leg as well:
   - `npm run live-sites:test`

## Billing launch blockers
- `BLOCKED` if the Stripe Tax decision is still unresolved.
- `BLOCKED` if staging uses live Stripe credentials.
- `BLOCKED` if the webhook endpoint cannot verify signatures in staging.
- `BLOCKED` if checkout, portal, renewal, failure recovery, or cancel-at-period-end flows are unverified in staging.
- `BLOCKED` if support cannot locate the staged customer in Stripe Dashboard.

## Billing rollback / safe-disable
- To pause new subscriptions without breaking existing customer recovery paths, remove `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`, or both from the target environment and redeploy.
- Keep `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` configured while active Stripe subscriptions exist so Customer Portal and webhook reconciliation keep working.
- Do not treat database resets or table drops as a billing rollback strategy; the billing schema changes are additive.

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
- Billing checkout result:
- Billing portal result:
- Billing renewal/failure result:
- Stripe support visibility result:
- Stripe Tax decision:
- Notes/blockers:
- Final sign-off (`PASS`/`BLOCKED`):

## Latest local evidence (2026-02-14)
- `./scripts/verify_podcast_contract.sh "http://localhost:3000/rss/5OZV8xtOGO1yXGMRx01m_kc6eNSGlRYnyzyZJ8tcZYs.xml"` passed with:
  - feed `HEAD` 200
  - media `HEAD` 200
  - range `206`
