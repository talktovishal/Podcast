import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import type Stripe from "stripe";
import { fileURLToPath } from "node:url";
import { applyStripeWebhookEvent, buildBillingSnapshot } from "../src/lib/billing";
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

test("buildBillingSnapshot prefers complimentary access when present", () => {
  const snapshot = buildBillingSnapshot({
    id: "user_1",
    email: "user@example.com",
    name: null,
    complimentaryPro: true,
    billingProvider: null,
    billingCustomerId: null,
    billingSubscriptionId: null,
    billingPlanCode: "STARTER",
    billingStatus: "NONE",
    billingCurrentPeriodEnd: null,
    billingCancelAtPeriodEnd: false,
    billingUpdatedAt: null,
    isPaid: true
  });

  assert.equal(snapshot.hasPaidAccess, true);
  assert.equal(snapshot.accessReason, "complimentary");
  assert.equal(snapshot.planCode, "STARTER");
  assert.equal(snapshot.status, "NONE");
});

test("applyStripeWebhookEvent updates billing state once per Stripe event id", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const periodEnd = Math.floor(Date.now() / 1000) + 86_400;

  const user = await prisma.user.create({
    data: {
      email: `billing-${uniq}@articlepod.local`,
      role: "USER",
      billingProvider: "stripe",
      billingCustomerId: `cus_${uniq}`,
      billingPlanCode: "STARTER",
      billingStatus: "NONE",
      complimentaryPro: false,
      isPaid: false,
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const event = {
      id: `evt_${uniq}`,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: `sub_${uniq}`,
          status: "active",
          customer: `cus_${uniq}`,
          cancel_at_period_end: false,
          metadata: {
            articlepod_plan_code: "PRO_MONTHLY"
          },
          items: {
            data: [
              {
                current_period_end: periodEnd,
                price: {
                  id: `price_${uniq}`
                }
              }
            ]
          }
        }
      }
    } as unknown as Stripe.Event;

    await applyStripeWebhookEvent(event);
    await applyStripeWebhookEvent(event);

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(updatedUser.billingSubscriptionId, `sub_${uniq}`);
    assert.equal(updatedUser.billingPlanCode, "PRO_MONTHLY");
    assert.equal(updatedUser.billingStatus, "ACTIVE");
    assert.equal(updatedUser.isPaid, true);
    assert.equal(updatedUser.billingCurrentPeriodEnd?.toISOString(), new Date(periodEnd * 1000).toISOString());

    const events = await prisma.billingWebhookEvent.findMany({
      where: {
        provider: "stripe",
        providerEventId: `evt_${uniq}`
      }
    });
    assert.equal(events.length, 1);
  } finally {
    await prisma.billingWebhookEvent.deleteMany({
      where: {
        OR: [{ userId: user.id }, { customerId: `cus_${uniq}` }]
      }
    });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
