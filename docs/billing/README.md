# Billing Handoff

Use this note when you come back to Stripe billing work later.

Status as of 2026-03-15:
- Stripe-hosted Checkout, Customer Portal, billing status, and webhook sync are implemented.
- ArticlePod stores only Stripe billing metadata plus effective access state. Card details stay in Stripe.
- Self-serve billing is scoped to `Starter` and `Pro monthly`.
- `Team` is still a non-self-serve plan.

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

7. Subscribe the webhook to:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Recommended Stripe dashboard follow-up:
- confirm your branding/logo in hosted Checkout and Portal
- review cancelation settings for end-of-period cancelation
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

Useful check:

```bash
curl -X GET "$APP_URL/api/billing/status" \
  -H "cookie: articlepod_session=<session-cookie>"
```

Useful log grep:

```bash
rg 'billing' /Users/vishalchowdhary/Documents/Podcast/.runtime/logs/web/app.log.jsonl | tail -n 100
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

1. Finish any unrelated product changes first.
2. Configure Stripe test mode and env vars.
3. Run the local checkout and webhook flow.
4. Verify cancelation and payment-method updates in Customer Portal.
5. Validate the billing status route and logs.
6. Resolve the Prisma migration rollout plan for the target environment.
7. Deploy to a staging or parity environment with Stripe test keys.
8. Repeat the full billing flow there.
9. Only then switch to Stripe live keys.

## Product constraints to remember

- v1 billing is `Starter` plus `Pro monthly`
- `Team` still needs a later org/seat design before self-serve billing
- webhook state is the source of truth for subscription status
- `isPaid` is only a compatibility cache for the rest of the app
- `complimentaryPro` is the manual support/admin override

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
