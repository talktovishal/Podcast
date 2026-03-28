# Billing Handoff

Use this note when you come back to Stripe billing work later.

Status as of 2026-03-28:
- Stripe-hosted Checkout, Customer Portal, billing status, and baseline webhook sync are implemented for `Pro monthly`.
- ArticlePod stores Stripe billing metadata plus effective access state. Card details stay in Stripe-hosted flows.
- Self-serve billing stays scoped to `Starter` free + `Pro monthly` for MVP.
- `Team`, annual billing, coupons, trials, seats, usage billing, and non-card methods remain out of scope for the current launch track.

## What is already done

Key code paths:
- `apps/web/src/lib/billing.ts`
- `apps/web/src/app/api/billing/checkout/route.ts`
- `apps/web/src/app/api/billing/portal/route.ts`
- `apps/web/src/app/api/billing/status/route.ts`
- `apps/web/src/app/api/billing/webhook/route.ts`

Persisted billing state:
- Prisma user fields for `billingProvider`, `billingCustomerId`, `billingSubscriptionId`, `billingPlanCode`, `billingStatus`, `billingCurrentPeriodEnd`, `billingCancelAtPeriodEnd`, `billingUpdatedAt`, `complimentaryPro`, and `isPaid`
- `BillingWebhookEvent` idempotency table
- Matching Azure Table metadata support

UI already wired:
- `/pricing` starts hosted checkout for `Pro`
- `/app/settings` shows billing status and launches Stripe Customer Portal
- Admins can grant `complimentaryPro` instead of mutating Stripe-managed state

## Open gaps vs. the expanded Stripe MVP spec

Tracked in `docs/plans.md` as `B02`-`B09`:
- local billing state still needs explicit `price_id`, payment-status, and entitlement-shape hardening for supportability
- checkout flow needs approved server-side plan catalog hardening and a documented pending-activation UX
- webhook handling currently centers on checkout completion plus subscription lifecycle events; invoice lifecycle events and payment-issue mapping still need to land
- billing settings UX still needs richer renewal, cancel-at-period-end, and payment-issue presentation
- support tooling still needs read-only Stripe identifiers, last invoice or payment visibility, and a Stripe Dashboard deep link
- founder-owned Stripe Dashboard setup, Test Clock QA, and staging launch evidence still need to be completed

## Billing roadmap snapshot

- `B01` Done: billing docs and milestone expansion are reconciled across `docs/plans.md`, `docs/Prompts.md`, and this handoff.
- `B02` Planned: billing state contract hardening across Prisma and Azure Table metadata backends.
- `B03` Planned: approved plan catalog and checkout contract hardening for `PRO_MONTHLY`.
- `B04` Planned: invoice-aware webhook and entitlement engine.
- `B05` Planned: richer `/app/settings` billing UX plus clearer hosted portal recovery paths.
- `B06` Planned: admin support visibility and webhook observability hardening.
- `B07` Planned: founder Stripe Dashboard setup and per-environment secret promotion checklist.
- `B08` Planned: lifecycle QA with Stripe CLI, test cards, and Test Clocks.
- `B09` Planned: staging certification, launch checklist, and rollback or safe-disable evidence.

## What you still need to do in Stripe

Before billing works in a real environment:

1. Create the Pro monthly recurring price in Stripe.
2. Copy the Stripe price id into `STRIPE_PRICE_PRO_MONTHLY`.
3. Set `STRIPE_SECRET_KEY`.
4. Set `STRIPE_WEBHOOK_SECRET`.
5. Optionally set `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` if you want to pin a specific portal config.
6. Create a webhook endpoint that points to:

```text
https://<your-domain>/api/billing/webhook
```

7. Subscribe the webhook to the currently implemented baseline events:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Planned final webhook set once `B04` lands:
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.payment_action_required`

Recommended Stripe dashboard follow-up:
- confirm your branding/logo in hosted Checkout and Portal
- review cancelation settings for end-of-period cancelation
- decide whether self-serve plan switching should stay disabled until multi-plan pricing exists
- review proration behavior for any later self-serve plan changes
- review customer email settings
- decide whether Stripe Tax should be enabled before opening billing outside the US

## Required environment variables

Set these wherever the web app runs:

```bash
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_BILLING_PORTAL_CONFIGURATION_ID=bpc_...   # optional
```

See also:
- `docs/env.md`
- `docs/operations.md`

## Local test flow to resume later

1. Start the app.
2. Forward Stripe webhooks locally:

```bash
stripe listen --forward-to http://127.0.0.1:3000/api/billing/webhook
```

3. Sign in as a test user.
4. Open `/pricing` and start Pro checkout.
5. Complete checkout with a Stripe test card.
6. Confirm `/app/settings` shows the expected plan and status.
7. Launch Customer Portal from settings and test:
- cancel at period end
- update payment method
- reactivate if enabled in your portal config
8. Once `B04` and `B05` land, trigger or simulate failure paths and confirm the account surfaces a billing issue state instead of granting access from redirect alone.
9. Record anything missing against `B04`-`B08` in `docs/plans.md`.

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

The billing migration is checked in here:
- `apps/web/prisma/migrations/20260314193000_add_billing_state/migration.sql`

Important caveat:
- normal `prisma migrate dev` is already blocked by an older SQLite migration issue in `20260228180000_role_check_constraint`
- the billing migration was generated from a schema diff and checked in manually
- local bootstrap still works because this repo commonly uses `prisma db push`

If you come back to production rollout work, do this before relying on Prisma migrations as the rollout path:

1. Reconcile or replace the broken older SQLite migration chain.
2. Verify the billing migration cleanly on PostgreSQL in parity mode.
3. Decide whether production rollout should use:
- a cleaned-up Prisma migration chain
- a one-time manual SQL application for the billing fields

## Recommended rollout checklist

When you pick this back up, the safest order is:

1. Finish `B02` so the local billing state can represent price, payment, entitlement, and processed-event outcomes cleanly.
2. Finish `B03` and confirm checkout still uses server-side plan keys only.
3. Finish `B04` and verify invoice-driven entitlement handling locally with Stripe CLI.
4. Finish `B05` and confirm `/app/settings` communicates active, pending, canceling, and blocked states clearly.
5. Finish `B06` so support and operations can inspect billing issues without mutating Stripe.
6. Resolve the Prisma migration rollout plan for the target environment before relying on schema changes in parity or staging.
7. Complete founder-owned `B07` Stripe Dashboard setup and provide test-mode secrets through normal secret management.
8. Run `B08` lifecycle QA with Stripe test cards and Test Clocks in local and staging environments.
9. Complete `B09` staging certification and only then switch to live keys.

## Product constraints to remember

- v1 billing is `Starter` plus `Pro monthly`
- `Team` still needs a later org/seat design before self-serve billing
- webhook state is the source of truth for subscription status
- `isPaid` is only a compatibility cache for the rest of the app
- `complimentaryPro` is the manual support/admin override
- founder must make the Stripe Tax decision before live launch; engineering should not silently choose that policy

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
- dunning or failed-payment support UX beyond the current grace-period mapping
