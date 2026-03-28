# Billing Handoff

Use this note when you come back to Stripe billing work later.

Status as of 2026-03-28:
- Stripe-hosted Checkout, Customer Portal, invoice-aware webhook sync, billing status, and support visibility are implemented for `Pro monthly`.
- ArticlePod stores Stripe billing metadata, entitlement state, latest invoice/payment state, and webhook audit watermarks. Card details stay in Stripe-hosted flows.
- Self-serve billing stays scoped to `Starter` free + `Pro monthly` for MVP.
- `Team`, annual billing, coupons, trials, seats, usage billing, and non-card methods remain out of scope for the current launch track.

## What is already done

Stable API surface:
- `POST /api/billing/checkout`
- `POST /api/billing/portal`
- `GET /api/billing/status`
- `POST /api/billing/webhook`

Key code paths:
- `apps/web/src/lib/billing.ts`
- `apps/web/src/app/api/billing/checkout/route.ts`
- `apps/web/src/app/api/billing/portal/route.ts`
- `apps/web/src/app/api/billing/status/route.ts`
- `apps/web/src/app/api/billing/webhook/route.ts`

Persisted billing state:
- Prisma user fields now cover `billingProvider`, `billingCustomerId`, `billingSubscriptionId`, `billingPriceId`, `billingPlanCode`, `billingStatus`, `billingEntitlementStatus`, `billingLastPaymentStatus`, `billingLastInvoiceId`, `billingCurrentPeriodEnd`, `billingCancelAtPeriodEnd`, `billingLastStripeEventId`, event watermarks, `billingUpdatedAt`, `complimentaryPro`, and `isPaid`
- `BillingWebhookEvent` is the Stripe event idempotency + audit table and now stores event ids, event type, event creation time, object id, subscription id, invoice id, apply status, and failure notes
- Matching Azure Table metadata support exists for the same effective billing fields, with compatibility defaults for older rows that do not yet have the additive billing columns

UI already wired:
- `/pricing` starts hosted checkout for `Pro`
- `/app/settings` shows billing status, renewal date, cancel-at-period-end state, pending activation, payment-issue banners, and launches Stripe Customer Portal
- `/pricing` and settings only submit approved internal plan keys; raw Stripe price ids never come from the browser
- Admins can grant `complimentaryPro` instead of mutating Stripe-managed state
- `/admin` shows read-only Stripe customer/subscription/invoice identifiers plus Stripe Dashboard deep links for support workflows

Webhook events currently handled:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.payment_action_required`

Webhook behavior:
- access is granted or extended only after webhook-confirmed billing events
- `checkout.session.completed` writes a pending billing record but does not unlock Pro access on its own
- duplicate Stripe event ids are ignored
- older subscription or invoice events are ignored once a newer domain watermark has already been applied

## Forward migration and compatibility plan

This billing rollout is additive and upgrade-in-place:

1. Prisma schemas add nullable or defaulted billing fields plus additive webhook audit columns. No table drops, resets, or destructive migration steps are part of this rollout.
2. Azure Table primary metadata accepts the new billing fields while defaulting missing historical values to safe compatibility states (`INACTIVE`, `NONE`, null ids).
3. The billing snapshot still derives `isPaid` from the newer entitlement fields when present, but falls back to the legacy `billingPlanCode` + `billingStatus` shape for pre-expansion rows so existing paid users do not lose access during rollout.
4. Rollback does not require removing the new columns. Older quota and access checks continue to work through the existing `isPaid` compatibility cache while the new fields remain stored.

## Billing roadmap snapshot

- `B01` Done: billing docs and milestone expansion are reconciled across `docs/plans.md`, `docs/Prompts.md`, and this handoff.
- `B02` Done: billing state contract hardening across Prisma and Azure Table metadata backends.
- `B03` Done: approved plan catalog and checkout contract hardening for `PRO_MONTHLY`.
- `B04` Done: invoice-aware webhook and entitlement engine.
- `B05` Done: richer `/app/settings` billing UX plus clearer hosted portal recovery paths.
- `B06` Done: admin support visibility and webhook observability hardening.
- `B07` Done: founder Stripe Dashboard setup and per-environment secret promotion checklist are documented.
- `B08` Done: lifecycle QA procedures and webhook resilience tests are documented and in repo.
- `B09` In Progress: staging certification, launch checklist execution, founder dashboard completion, and rollback or safe-disable evidence still need live environment sign-off.

## What you still need to do in Stripe

Founder or operator-owned Stripe Dashboard work before launch:

1. Create or verify the Stripe account and complete business verification or KYC.
2. Connect the payout bank account and set statement descriptor, support email, and support URL.
3. Create the `Pro monthly` recurring price in Stripe and keep the internal naming tied to `PRO_MONTHLY`.
4. Configure Stripe Customer Portal:
   - payment method updates enabled
   - invoice history enabled
   - cancellation allowed at period end
   - plan switching only if you intentionally enable future multi-price self-serve behavior
5. Configure retry, dunning, and customer email defaults for recurring billing.
6. Decide the Stripe Tax policy before live launch:
   - either launch without Stripe Tax and manage obligations manually
   - or enable Stripe Tax intentionally
7. Configure checkout and portal branding.
8. Create the webhook endpoint that points to:

```text
https://<your-domain>/api/billing/webhook
```

9. Subscribe the webhook to the implemented event set:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.payment_action_required`
10. Provide test, staging, and production Stripe secrets through normal secret management, keeping webhook secrets separate per environment.

Recommended Stripe dashboard follow-up:
- confirm your branding/logo in hosted Checkout and Portal
- confirm cancelation is set to end-of-period for MVP
- confirm proration behavior for any later self-serve plan changes
- leave coupons, trials, annual pricing, team billing, seats, usage billing, and non-card methods disabled for this MVP
- review customer email settings
- resolve the Stripe Tax decision before opening billing outside the US or moving to live launch

## Required environment variables

Set these wherever the web app runs:

```bash
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_BILLING_PORTAL_CONFIGURATION_ID=bpc_...   # optional
```

Environment isolation rules:
- use Stripe test-mode secret keys, price ids, portal config ids, and webhook secrets in local and staging environments
- use separate live-mode values only in production
- never mix live Stripe secrets into local or staging environments
- if `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` is pinned, remember that Stripe test and live modes use different ids

See also:
- `docs/env.md`
- `docs/operations.md`

## Lifecycle QA plan

Required local or staging scenarios:

1. Purchase and activation
   - new user buys `Pro monthly`
   - app redirects to Stripe Checkout and back to `/app/settings?billing=success`
   - settings shows pending activation until webhook confirmation
   - `invoice.paid` (or equivalent test lifecycle confirmation) grants access and updates renewal date
2. Initial payment failure
   - the first subscription invoice fails
   - account stays `INCOMPLETE` with no Pro access
   - settings shows a payment issue and billing portal recovery path
3. Renewal success
   - recurring invoice is paid
   - access extends through the next `currentPeriodEnd`
4. Renewal failure
   - recurring invoice payment fails or requires action
   - account shows `GRACE_PERIOD` or action-required state instead of silently removing access immediately
   - user can recover through the billing portal
5. Cancellation at period end
   - portal sets `cancel_at_period_end`
   - app shows the end date while keeping access until the current period completes
6. Portal self-service
   - update card
   - inspect invoice history
   - return to the app cleanly
7. Webhook resilience
   - duplicate event delivery does not create duplicate state changes
   - older subscription or invoice events are ignored after newer ones
   - invalid webhook signatures are rejected
8. Test Clock lifecycle
   - use Stripe Test Clocks to simulate renewal, cancellation-at-period-end, and retry windows instead of waiting for real monthly cycles

## Local test flow

1. Start the app.
2. Forward Stripe webhooks locally:

```bash
stripe listen --forward-to http://127.0.0.1:3000/api/billing/webhook
```

3. Sign in as a test user.
4. Open `/pricing` and start Pro checkout.
5. Complete checkout with a Stripe test card.
6. Confirm `/app/settings` first shows pending activation, then updates to the expected plan, renewal date, and status after webhook confirmation.
7. Launch Customer Portal from settings and test:
- cancel at period end
- update payment method
- reactivate if enabled in your portal config
8. Trigger failure paths with Stripe test cards:
- initial card decline
- renewal failure
- authentication required
9. Use Stripe Test Clocks for renewal, retry, and end-of-period cancelation scenarios.
10. Record anything still missing against `B09` in `docs/plans.md`.

Useful check:

```bash
curl -X GET "$APP_URL/api/billing/status" \
  -H "cookie: articlepod_session=<session-cookie>"
```

Useful log grep:

```bash
rg 'billing' \
  /Users/vishalchowdhary/Documents/Podcast/.runtime/logs/events/web \
  /Users/vishalchowdhary/Documents/Podcast/.runtime/logs/errors/web | tail -n 100
```

## Prisma migration caveat

Billing migrations currently checked in:
- `apps/web/prisma/migrations/20260314193000_add_billing_state/migration.sql`
- `apps/web/prisma/migrations/20260328193000_expand_billing_contract/migration.sql`

Important caveat:
- normal `prisma migrate dev` is already blocked by an older SQLite migration issue in `20260228180000_role_check_constraint`
- the billing migrations were generated from schema diffs and checked in manually
- local bootstrap still works because this repo commonly uses `prisma db push`

If you come back to production rollout work, do this before relying on Prisma migrations as the rollout path:

1. Reconcile or replace the broken older SQLite migration chain.
2. Verify the billing migration cleanly on PostgreSQL in parity mode.
3. Decide whether production rollout should use:
- a cleaned-up Prisma migration chain
- a one-time manual SQL application for the billing fields

## Recommended rollout checklist

When you pick this back up, the safest order is:

1. Apply the additive billing schema change for the target environment and confirm the deployment path does not require resets or table drops.
2. Complete founder-owned `B07` Stripe Dashboard setup and provide test-mode secrets through normal secret management.
3. Run `B08` lifecycle QA with Stripe test cards and Test Clocks in local and staging environments.
4. Execute `B09` staging certification, including support visibility and rollback or safe-disable checks.
5. Only after staging passes, switch to live keys and complete live launch evidence.

## Product constraints to remember

- v1 billing is `Starter` plus `Pro monthly`
- `Team` still needs a later org/seat design before self-serve billing
- webhook state is the source of truth for subscription status
- `isPaid` is only a compatibility cache for the rest of the app
- `complimentaryPro` is the manual support/admin override
- founder must make the Stripe Tax decision before live launch; engineering should not silently choose that policy
- checkout success redirect is not the source of truth for access; webhook-confirmed billing events remain authoritative
- for incident response, keep webhook handling and the billing portal live for existing customers even if you temporarily disable new checkout

## Useful docs

- `docs/env.md`
- `docs/operations.md`
- `docs/documentation.md`
- `docs/architecture.md`
- `docs/plans.md`

## Nice-to-have follow-ups

These are optional and were not part of the initial billing launch:
- annual Pro pricing
- coupons/promo codes
- self-serve Team billing
- Stripe Tax rollout for broader geography
- stronger billing/admin analytics
- richer dunning automation and customer email recovery workflows beyond the current grace-period mapping
