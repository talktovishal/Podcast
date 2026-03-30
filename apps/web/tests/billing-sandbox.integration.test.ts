import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import Stripe from "stripe";
import { fileURLToPath } from "node:url";
import {
  createStripeBillingPortalSession,
  createStripeCheckoutSession,
  getBillingAccountSnapshot
} from "../src/lib/billing";
import { env } from "../src/lib/env";
import { prisma } from "../src/lib/prisma";
import { updatePrimaryUser } from "../src/lib/metadata-primary-auth";

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
    env.stripeSecretKey?.startsWith("sk_test_") &&
    env.stripePriceProMonthly &&
    env.appUrl
);

const sandboxSkipReason =
  "Set ARTICLEPOD_STRIPE_SANDBOX_TEST=1 with Stripe sandbox env vars to run live Stripe integration coverage.";

function sandboxStripe(): Stripe {
  if (!sandboxEnabled || !env.stripeSecretKey) {
    throw new Error(sandboxSkipReason);
  }
  return new Stripe(env.stripeSecretKey);
}

test(
  "sandbox billing integration creates checkout and portal sessions with live Stripe test data",
  { skip: sandboxEnabled ? false : sandboxSkipReason },
  async () => {
    ensureDbBootstrap();
    const uniq = Date.now().toString(36);
    const stripe = sandboxStripe();
    const user = await prisma.user.create({
      data: {
        email: `sandbox-checkout-${uniq}@articlepod.local`,
        role: "USER",
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

      const portal = await createStripeBillingPortalSession(user.id);
      assert.match(portal.sessionId, /^bps_/);
      assert.match(portal.customerId, /^cus_/);
      assert.equal(portal.customerId, checkout.customerId);
      assert.equal(portal.url.includes("billing.stripe.com"), true);

      await stripe.customers.del(checkout.customerId);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
);

test(
  "sandbox billing integration reconciles a stale local cache from Stripe subscription state",
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
          price: env.stripePriceProMonthly!
        }
      ],
      default_payment_method: paymentMethod.id,
      expand: ["latest_invoice.payment_intent"]
    });

    const user = await prisma.user.create({
      data: {
        email: `sandbox-local-${uniq}@articlepod.local`,
        role: "USER",
        billingProvider: "stripe",
        billingCustomerId: customer.id,
        billingPlanCode: "STARTER",
        billingStatus: "NONE",
        billingEntitlementStatus: "INACTIVE",
        billingLastPaymentStatus: "NONE",
        complimentaryPro: false,
        isPaid: false,
        ttsProvider: "kokoro",
        ttsVoice: "af_heart"
      }
    });

    try {
      await updatePrimaryUser(user.id, {
        billingProvider: "stripe",
        billingCustomerId: customer.id,
        billingPlanCode: "STARTER",
        billingStatus: "NONE",
        billingEntitlementStatus: "INACTIVE",
        billingLastPaymentStatus: "NONE",
        isPaid: false
      });

      const snapshot = await getBillingAccountSnapshot(user.id);
      assert.equal(snapshot.customerId, customer.id);
      assert.equal(snapshot.subscriptionId, subscription.id);
      assert.equal(snapshot.planCode, "PRO_MONTHLY");
      assert.equal(snapshot.status, "ACTIVE");
      assert.equal(snapshot.hasPaidAccess, true);
    } finally {
      await stripe.subscriptions.cancel(subscription.id);
      await stripe.customers.del(customer.id);
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
);
