import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import type Stripe from "stripe";
import { fileURLToPath } from "node:url";
import {
  applyStripeWebhookEvent,
  buildBillingSnapshot,
  buildStripeDashboardLinks,
  getBillingSettingsState,
  selectStripeSubscriptionForSync
} from "../src/lib/billing";
import { setBillingLanePreference } from "../src/lib/billing";
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
    complimentaryPro: true,
    billingProvider: null,
    billingCustomerId: null,
    billingSubscriptionId: null,
    billingPriceId: null,
    billingPlanCode: "STARTER",
    billingStatus: "NONE",
    billingEntitlementStatus: "INACTIVE",
    billingLastPaymentStatus: "NONE",
    billingLastInvoiceId: null,
    billingCurrentPeriodEnd: null,
    billingCancelAtPeriodEnd: false,
    billingLastStripeEventId: null,
    billingLastStripeEventCreatedAt: null,
    billingLastSubscriptionEventAt: null,
    billingLastInvoiceEventAt: null,
    billingUpdatedAt: null,
    isPaid: true
  });

  assert.equal(snapshot.hasPaidAccess, true);
  assert.equal(snapshot.accessReason, "complimentary");
  assert.equal(snapshot.planCode, "STARTER");
  assert.equal(snapshot.status, "NONE");
  assert.equal(snapshot.planAccessLevel, "PRO");
  assert.equal(snapshot.entitlementStatus, "ACTIVE");
});

test("buildBillingSnapshot preserves active annual Pro subscriptions", () => {
  const snapshot = buildBillingSnapshot({
    complimentaryPro: false,
    billingProvider: "stripe",
    billingCustomerId: "cus_annual",
    billingSubscriptionId: "sub_annual",
    billingPriceId: "price_annual",
    billingPlanCode: "PRO_ANNUAL",
    billingStatus: "ACTIVE",
    billingEntitlementStatus: "ACTIVE",
    billingLastPaymentStatus: "PAID",
    billingLastInvoiceId: "in_annual",
    billingCurrentPeriodEnd: new Date("2026-12-31T00:00:00.000Z"),
    billingCancelAtPeriodEnd: false,
    billingLastStripeEventId: "evt_annual",
    billingLastStripeEventCreatedAt: new Date("2026-03-29T00:00:00.000Z"),
    billingLastSubscriptionEventAt: new Date("2026-03-29T00:00:00.000Z"),
    billingLastInvoiceEventAt: new Date("2026-03-29T00:00:00.000Z"),
    billingUpdatedAt: new Date("2026-03-29T00:00:00.000Z"),
    isPaid: true
  });

  assert.equal(snapshot.planCode, "PRO_ANNUAL");
  assert.equal(snapshot.hasPaidAccess, true);
  assert.equal(snapshot.planAccessLevel, "PRO");
  assert.equal(snapshot.status, "ACTIVE");
  assert.equal(snapshot.lastPaymentStatus, "PAID");
});

test("buildStripeDashboardLinks points to the Stripe test dashboard", () => {
  const links = buildStripeDashboardLinks({
    provider: "stripe",
    customerId: "cus_123",
    subscriptionId: "sub_123",
    invoiceId: "in_123"
  });

  assert.equal(links.customerUrl?.endsWith("/customers/cus_123"), true);
  assert.equal(links.subscriptionUrl?.endsWith("/subscriptions/sub_123"), true);
  assert.equal(links.invoiceUrl?.endsWith("/invoices/in_123"), true);
});

test("selectStripeSubscriptionForSync prefers active subscriptions over stale canceled ones", () => {
  const selected = selectStripeSubscriptionForSync([
    {
      id: "sub_canceled",
      status: "canceled",
      created: 100,
      items: {
        data: [
          {
            current_period_end: 200,
            price: {
              id: "price_canceled"
            }
          }
        ]
      }
    } as unknown as Stripe.Subscription,
    {
      id: "sub_active",
      status: "active",
      created: 150,
      items: {
        data: [
          {
            current_period_end: 300,
            price: {
              id: "price_active"
            }
          }
        ]
      }
    } as unknown as Stripe.Subscription
  ]);

  assert.equal(selected?.id, "sub_active");
});

test("selectStripeSubscriptionForSync prefers the latest period end when statuses tie", () => {
  const selected = selectStripeSubscriptionForSync([
    {
      id: "sub_older",
      status: "active",
      created: 100,
      items: {
        data: [
          {
            current_period_end: 400,
            price: {
              id: "price_older"
            }
          }
        ]
      }
    } as unknown as Stripe.Subscription,
    {
      id: "sub_newer",
      status: "active",
      created: 90,
      items: {
        data: [
          {
            current_period_end: 800,
            price: {
              id: "price_newer"
            }
          }
        ]
      }
    } as unknown as Stripe.Subscription
  ]);

  assert.equal(selected?.id, "sub_newer");
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
      billingEntitlementStatus: "INACTIVE",
      billingLastPaymentStatus: "NONE",
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
      created: Math.floor(Date.now() / 1000),
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
    assert.equal(updatedUser.billingPriceId, `price_${uniq}`);
    assert.equal(updatedUser.billingPlanCode, "PRO_MONTHLY");
    assert.equal(updatedUser.billingStatus, "ACTIVE");
    assert.equal(updatedUser.billingEntitlementStatus, "ACTIVE");
    assert.equal(updatedUser.isPaid, true);
    assert.equal(updatedUser.billingCurrentPeriodEnd?.toISOString(), new Date(periodEnd * 1000).toISOString());

    const events = await prisma.billingWebhookEvent.findMany({
      where: {
        provider: "stripe_live",
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

test("invoice.paid grants access and records invoice metadata", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const periodEnd = Math.floor(Date.now() / 1000) + 31 * 24 * 60 * 60;

  const user = await prisma.user.create({
    data: {
      email: `billing-paid-${uniq}@articlepod.local`,
      role: "USER",
      billingProvider: "stripe",
      billingCustomerId: `cus_paid_${uniq}`,
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
    const event = {
      id: `evt_paid_${uniq}`,
      created: Math.floor(Date.now() / 1000),
      type: "invoice.paid",
      data: {
        object: {
          id: `in_${uniq}`,
          customer: `cus_paid_${uniq}`,
          billing_reason: "subscription_create",
          period_end: periodEnd,
          parent: {
            subscription_details: {
              metadata: {
                articlepod_user_id: user.id,
                articlepod_plan_code: "PRO_MONTHLY"
              },
              subscription: `sub_paid_${uniq}`
            }
          },
          lines: {
            data: [
              {
                id: `line_${uniq}`,
                subscription: `sub_paid_${uniq}`,
                period: {
                  start: periodEnd - 31 * 24 * 60 * 60,
                  end: periodEnd
                },
                pricing: {
                  type: "price_details",
                  unit_amount_decimal: "1900",
                  price_details: {
                    price: `price_paid_${uniq}`,
                    product: "prod_123"
                  }
                }
              }
            ]
          }
        }
      }
    } as unknown as Stripe.Event;

    await applyStripeWebhookEvent(event);

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(updatedUser.billingSubscriptionId, `sub_paid_${uniq}`);
    assert.equal(updatedUser.billingPriceId, `price_paid_${uniq}`);
    assert.equal(updatedUser.billingLastInvoiceId, `in_${uniq}`);
    assert.equal(updatedUser.billingLastPaymentStatus, "PAID");
    assert.equal(updatedUser.billingPlanCode, "PRO_MONTHLY");
    assert.equal(updatedUser.billingStatus, "ACTIVE");
    assert.equal(updatedUser.billingEntitlementStatus, "ACTIVE");
    assert.equal(updatedUser.isPaid, true);
    assert.equal(updatedUser.billingCurrentPeriodEnd?.toISOString(), new Date(periodEnd * 1000).toISOString());
  } finally {
    await prisma.billingWebhookEvent.deleteMany({
      where: {
        OR: [{ userId: user.id }, { customerId: `cus_paid_${uniq}` }]
      }
    });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("invoice.payment_failed keeps renewal access in grace period", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const periodEnd = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  const user = await prisma.user.create({
    data: {
      email: `billing-failed-${uniq}@articlepod.local`,
      role: "USER",
      billingProvider: "stripe",
      billingCustomerId: `cus_failed_${uniq}`,
      billingSubscriptionId: `sub_failed_${uniq}`,
      billingPriceId: `price_failed_${uniq}`,
      billingPlanCode: "PRO_MONTHLY",
      billingStatus: "ACTIVE",
      billingEntitlementStatus: "ACTIVE",
      billingLastPaymentStatus: "PAID",
      complimentaryPro: false,
      billingCurrentPeriodEnd: new Date(periodEnd * 1000),
      isPaid: true,
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const event = {
      id: `evt_failed_${uniq}`,
      created: Math.floor(Date.now() / 1000),
      type: "invoice.payment_failed",
      data: {
        object: {
          id: `in_failed_${uniq}`,
          customer: `cus_failed_${uniq}`,
          billing_reason: "subscription_cycle",
          period_end: periodEnd,
          parent: {
            subscription_details: {
              metadata: {
                articlepod_user_id: user.id,
                articlepod_plan_code: "PRO_MONTHLY"
              },
              subscription: `sub_failed_${uniq}`
            }
          },
          lines: {
            data: [
              {
                id: `line_failed_${uniq}`,
                subscription: `sub_failed_${uniq}`,
                period: {
                  start: periodEnd - 7 * 24 * 60 * 60,
                  end: periodEnd
                },
                pricing: {
                  type: "price_details",
                  unit_amount_decimal: "1900",
                  price_details: {
                    price: `price_failed_${uniq}`,
                    product: "prod_123"
                  }
                }
              }
            ]
          }
        }
      }
    } as unknown as Stripe.Event;

    await applyStripeWebhookEvent(event);

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(updatedUser.billingStatus, "GRACE_PERIOD");
    assert.equal(updatedUser.billingEntitlementStatus, "GRACE_PERIOD");
    assert.equal(updatedUser.billingLastPaymentStatus, "FAILED");
    assert.equal(updatedUser.billingLastInvoiceId, `in_failed_${uniq}`);
    assert.equal(updatedUser.isPaid, true);
  } finally {
    await prisma.billingWebhookEvent.deleteMany({
      where: {
        OR: [{ userId: user.id }, { customerId: `cus_failed_${uniq}` }]
      }
    });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("stale subscription webhook events are ignored after a newer one is applied", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const newerPeriodEnd = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;
  const olderPeriodEnd = Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60;

  const user = await prisma.user.create({
    data: {
      email: `billing-stale-${uniq}@articlepod.local`,
      role: "USER",
      billingProvider: "stripe",
      billingCustomerId: `cus_stale_${uniq}`,
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
    const newerEvent = {
      id: `evt_stale_new_${uniq}`,
      created: Math.floor(Date.now() / 1000),
      type: "customer.subscription.updated",
      data: {
        object: {
          id: `sub_stale_${uniq}`,
          status: "active",
          customer: `cus_stale_${uniq}`,
          cancel_at_period_end: false,
          metadata: {
            articlepod_plan_code: "PRO_MONTHLY"
          },
          items: {
            data: [
              {
                current_period_end: newerPeriodEnd,
                price: {
                  id: `price_stale_${uniq}`
                }
              }
            ]
          }
        }
      }
    } as unknown as Stripe.Event;

    const olderEvent = {
      id: `evt_stale_old_${uniq}`,
      created: Math.floor(Date.now() / 1000) - 3600,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: `sub_stale_${uniq}`,
          status: "canceled",
          customer: `cus_stale_${uniq}`,
          cancel_at_period_end: true,
          metadata: {
            articlepod_plan_code: "PRO_MONTHLY"
          },
          items: {
            data: [
              {
                current_period_end: olderPeriodEnd,
                price: {
                  id: `price_stale_${uniq}`
                }
              }
            ]
          }
        }
      }
    } as unknown as Stripe.Event;

    await applyStripeWebhookEvent(newerEvent);
    const staleResult = await applyStripeWebhookEvent(olderEvent);

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(updatedUser.billingStatus, "ACTIVE");
    assert.equal(updatedUser.billingEntitlementStatus, "ACTIVE");
    assert.equal(updatedUser.billingCancelAtPeriodEnd, false);
    assert.equal(updatedUser.billingCurrentPeriodEnd?.toISOString(), new Date(newerPeriodEnd * 1000).toISOString());
    assert.equal(staleResult.status, "IGNORED_STALE");

    const staleEventRow = await prisma.billingWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: "stripe_live",
          providerEventId: `evt_stale_old_${uniq}`
        }
      }
    });
    assert.equal(staleEventRow?.status, "IGNORED_STALE");
  } finally {
    await prisma.billingWebhookEvent.deleteMany({
      where: {
        OR: [{ userId: user.id }, { customerId: `cus_stale_${uniq}` }]
      }
    });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("non-eligible users fall back to live billing even if sandbox preference is persisted", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      email: `lane-fallback-${uniq}@articlepod.local`,
      role: "USER",
      billingLanePreference: "SANDBOX",
      complimentaryPro: false,
      isPaid: false,
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const state = await getBillingSettingsState(user.id);
    assert.equal(state.mode.canUseSandbox, false);
    assert.equal(state.mode.selectedLane, "SANDBOX");
    assert.equal(state.mode.effectiveLane, "LIVE");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("admins can persist sandbox billing mode preference", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      email: `lane-admin-${uniq}@articlepod.local`,
      role: "ADMIN",
      complimentaryPro: false,
      isPaid: false,
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const mode = await setBillingLanePreference(user.id, "SANDBOX");
    assert.equal(mode.canUseSandbox, true);
    assert.equal(mode.selectedLane, "SANDBOX");
    assert.equal(mode.effectiveLane, "SANDBOX");

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(updatedUser.billingLanePreference, "SANDBOX");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("checked-in tester allowlist can use sandbox billing without extra env config", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      email: " TalkToVishal@gmail.com ",
      role: "USER",
      billingLanePreference: "SANDBOX",
      complimentaryPro: false,
      isPaid: false,
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const state = await getBillingSettingsState(user.id);
    assert.equal(state.mode.canUseSandbox, true);
    assert.equal(state.mode.selectedLane, "SANDBOX");
    assert.equal(state.mode.effectiveLane, "SANDBOX");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("sandbox subscription webhook updates sandbox billing without changing live access", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const periodEnd = Math.floor(Date.now() / 1000) + 86_400;

  const user = await prisma.user.create({
    data: {
      email: `sandbox-webhook-${uniq}@articlepod.local`,
      role: "USER",
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
    const event = {
      id: `evt_sandbox_${uniq}`,
      created: Math.floor(Date.now() / 1000),
      type: "customer.subscription.updated",
      data: {
        object: {
          id: `sub_sandbox_${uniq}`,
          status: "active",
          customer: `cus_sandbox_${uniq}`,
          cancel_at_period_end: false,
          metadata: {
            articlepod_user_id: user.id,
            articlepod_plan_code: "PRO_MONTHLY",
            articlepod_billing_lane: "SANDBOX"
          },
          items: {
            data: [
              {
                current_period_end: periodEnd,
                price: {
                  id: `price_sandbox_${uniq}`
                }
              }
            ]
          }
        }
      }
    } as unknown as Stripe.Event;

    await applyStripeWebhookEvent(event, "SANDBOX");

    const liveUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(liveUser.billingPlanCode, "STARTER");
    assert.equal(liveUser.billingStatus, "NONE");
    assert.equal(liveUser.isPaid, false);

    const sandboxAccount = await prisma.sandboxBillingAccount.findUniqueOrThrow({
      where: { userId: user.id }
    });
    assert.equal(sandboxAccount.billingCustomerId, `cus_sandbox_${uniq}`);
    assert.equal(sandboxAccount.billingSubscriptionId, `sub_sandbox_${uniq}`);
    assert.equal(sandboxAccount.billingPlanCode, "PRO_MONTHLY");
    assert.equal(sandboxAccount.billingStatus, "ACTIVE");

    const webhookEvent = await prisma.billingWebhookEvent.findUniqueOrThrow({
      where: {
        provider_providerEventId: {
          provider: "stripe_sandbox",
          providerEventId: `evt_sandbox_${uniq}`
        }
      }
    });
    assert.equal(webhookEvent.status, "PROCESSED");
  } finally {
    await prisma.billingWebhookEvent.deleteMany({
      where: {
        OR: [{ userId: user.id }, { customerId: `cus_sandbox_${uniq}` }]
      }
    });
    await prisma.sandboxBillingAccount.deleteMany({
      where: { userId: user.id }
    });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
