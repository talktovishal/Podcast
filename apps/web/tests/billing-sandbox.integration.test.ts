import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import Stripe from "stripe";
import { fileURLToPath } from "node:url";
import {
  createStripeBillingPortalSession,
  createStripeCheckoutSession,
  getBillingSettingsState
} from "../src/lib/billing";
import { env } from "../src/lib/env";
import { prisma } from "../src/lib/prisma";

let dbReady = false;

function ensureDbBootstrap(): void {
  if (dbReady || process.env.ARTICLEPOD_TEST_DB_READY === "1") {
    dbReady = true;
    return;
  }

  const here = fileURLToPath(new URL(".", import.meta.url));
  const repoRoot = resolve(here, "../../..");
  const result = spawnSync("npx", ["pnpm", "--filter", "@articlepod/web", "run", "db:bootstrap"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "db bootstrap failed");
  }

  dbReady = true;
}

const sandboxEnabled = Boolean(
  process.env.ARTICLEPOD_STRIPE_SANDBOX_TEST === "1" &&
    env.stripeSandboxSecretKey?.startsWith("sk_test_") &&
    env.stripeSandboxPriceProMonthly &&
    env.appUrl
);

const sandboxSkipReason =
  "Set ARTICLEPOD_STRIPE_SANDBOX_TEST=1 with Stripe sandbox env vars to run live Stripe integration coverage.";

function sandboxStripe(): Stripe {
  if (!sandboxEnabled || !env.stripeSandboxSecretKey) {
    throw new Error(sandboxSkipReason);
  }
  return new Stripe(env.stripeSandboxSecretKey);
}

test(
  "sandbox billing integration creates checkout and portal sessions without touching live billing state",
  { skip: sandboxEnabled ? false : sandboxSkipReason },
  async () => {
    ensureDbBootstrap();
    const uniq = Date.now().toString(36);
    const stripe = sandboxStripe();
    const user = await prisma.user.create({
      data: {
        email: `sandbox-checkout-${uniq}@articlepod.local`,
        role: "ADMIN",
        billingLanePreference: "SANDBOX",
        complimentaryPro: false,
        isPaid: false,
        ttsProvider: "kokoro",
        ttsVoice: "af_heart"
      }
    });

    try {
      const checkout = await createStripeCheckoutSession({
        userId: user.id,
        planCode: "PRO_MONTHLY"
      });

      assert.match(checkout.sessionId, /^cs_/);
      assert.match(checkout.customerId, /^cus_/);
      assert.equal(checkout.url.includes("checkout.stripe.com") || checkout.url.includes("checkout.stripe.com/c/"), true);

      const liveUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      assert.equal(liveUser.billingCustomerId, null);

      const sandboxAccount = await prisma.sandboxBillingAccount.findUniqueOrThrow({
        where: { userId: user.id }
      });
      assert.equal(sandboxAccount.billingCustomerId, checkout.customerId);

      const portal = await createStripeBillingPortalSession(user.id);
      assert.match(portal.sessionId, /^bps_/);
      assert.match(portal.customerId, /^cus_/);
      assert.equal(portal.customerId, checkout.customerId);
      assert.equal(portal.url.includes("billing.stripe.com"), true);

      await stripe.customers.del(checkout.customerId);
    } finally {
      await prisma.sandboxBillingAccount.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
);

test(
  "sandbox billing integration reconciles stale sandbox billing state without changing live access",
  { skip: sandboxEnabled ? false : sandboxSkipReason },
  async () => {
    ensureDbBootstrap();
    const uniq = Date.now().toString(36);
    const stripe = sandboxStripe();
    const customer = await stripe.customers.create({
      email: `sandbox-reconcile-${uniq}@articlepod.local`,
      name: "Stripe Sandbox Reconcile"
    });
    const paymentMethod = await stripe.paymentMethods.create({
      type: "card",
      card: {
        token: "tok_visa"
      }
    });
    await stripe.paymentMethods.attach(paymentMethod.id, {
      customer: customer.id
    });
    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: paymentMethod.id
      }
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [
        {
          price: env.stripeSandboxPriceProMonthly!
        }
      ],
      default_payment_method: paymentMethod.id,
      expand: ["latest_invoice.payment_intent"]
    });

    const user = await prisma.user.create({
      data: {
        email: `sandbox-local-${uniq}@articlepod.local`,
        role: "ADMIN",
        billingLanePreference: "SANDBOX",
        complimentaryPro: false,
        isPaid: false,
        ttsProvider: "kokoro",
        ttsVoice: "af_heart"
      }
    });

    try {
      await prisma.sandboxBillingAccount.create({
        data: {
          userId: user.id,
          billingProvider: "stripe_sandbox",
          billingCustomerId: customer.id,
          billingPlanCode: "STARTER",
          billingStatus: "NONE",
          billingEntitlementStatus: "INACTIVE",
          billingLastPaymentStatus: "NONE"
        }
      });

      const state = await getBillingSettingsState(user.id);
      assert.equal(state.mode.effectiveLane, "SANDBOX");
      assert.equal(state.liveBilling.customerId, null);
      assert.equal(state.liveBilling.hasPaidAccess, false);
      assert.equal(state.selectedBilling.customerId, customer.id);
      assert.equal(state.selectedBilling.subscriptionId, subscription.id);
      assert.equal(state.selectedBilling.planCode, "PRO_MONTHLY");
      assert.equal(state.selectedBilling.status, "ACTIVE");
      assert.equal(state.selectedBilling.hasPaidAccess, true);
    } finally {
      await stripe.subscriptions.cancel(subscription.id);
      await stripe.customers.del(customer.id);
      await prisma.sandboxBillingAccount.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
);
