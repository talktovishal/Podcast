import Stripe from "stripe";
import { AppError, errorCodes } from "@articlepod/core";
import { env } from "./env";
import {
  createPrimaryBillingWebhookEvent,
  findPrimaryBillingWebhookEvent,
  findPrimaryUserByBillingCustomerId,
  findPrimaryUserById,
  updatePrimaryUser
} from "./metadata-primary-auth";

const STRIPE_PROVIDER = "stripe";

export type BillingPlanCode = "STARTER" | "PRO_MONTHLY";
export type BillingStatus = "NONE" | "ACTIVE" | "GRACE_PERIOD" | "CANCELED" | "INCOMPLETE";

type BillingUserRecord = {
  id: string;
  email: string;
  name: string | null;
  complimentaryPro: boolean;
  billingProvider: string | null;
  billingCustomerId: string | null;
  billingSubscriptionId: string | null;
  billingPlanCode: string;
  billingStatus: string;
  billingCurrentPeriodEnd: Date | null;
  billingCancelAtPeriodEnd: boolean;
  billingUpdatedAt: Date | null;
  isPaid: boolean;
};

export type BillingAccountSnapshot = {
  provider: "stripe" | null;
  planCode: BillingPlanCode;
  status: BillingStatus;
  customerId: string | null;
  subscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: string | null;
  complimentaryPro: boolean;
  hasPaidAccess: boolean;
  accessReason: "billing" | "complimentary" | null;
};

let stripeClient: Stripe | null = null;

function stripe(): Stripe {
  if (!env.stripeSecretKey) {
    throw new AppError(errorCodes.BILLING_UNAVAILABLE, "Billing is not configured for this environment yet.", 503);
  }

  stripeClient ??= new Stripe(env.stripeSecretKey);
  return stripeClient;
}

export function isBillingCheckoutConfigured(): boolean {
  return Boolean(env.stripeSecretKey && env.stripePriceProMonthly);
}

export function isBillingWebhookConfigured(): boolean {
  return Boolean(env.stripeSecretKey && env.stripeWebhookSecret);
}

export function normalizeBillingPlanCode(value: string | null | undefined): BillingPlanCode {
  return value === "PRO_MONTHLY" ? "PRO_MONTHLY" : "STARTER";
}

export function normalizeBillingStatus(value: string | null | undefined): BillingStatus {
  switch (value) {
    case "ACTIVE":
    case "GRACE_PERIOD":
    case "CANCELED":
    case "INCOMPLETE":
      return value;
    default:
      return "NONE";
  }
}

export function billingPlanLabel(planCode: BillingPlanCode): string {
  return planCode === "PRO_MONTHLY" ? "Pro" : "Starter";
}

export function billingStatusLabel(status: BillingStatus): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "GRACE_PERIOD":
      return "Payment retry in progress";
    case "CANCELED":
      return "Canceled";
    case "INCOMPLETE":
      return "Awaiting payment completion";
    default:
      return "Free";
  }
}

export function hasPaidBillingAccess(input: { complimentaryPro: boolean; billingPlanCode: string; billingStatus: string }): boolean {
  if (input.complimentaryPro) {
    return true;
  }

  const planCode = normalizeBillingPlanCode(input.billingPlanCode);
  const status = normalizeBillingStatus(input.billingStatus);
  return planCode === "PRO_MONTHLY" && (status === "ACTIVE" || status === "GRACE_PERIOD");
}

export function buildBillingSnapshot(input: BillingUserRecord): BillingAccountSnapshot {
  const planCode = normalizeBillingPlanCode(input.billingPlanCode);
  const status = normalizeBillingStatus(input.billingStatus);
  const hasPaidAccess = hasPaidBillingAccess(input);
  return {
    provider: input.billingProvider === STRIPE_PROVIDER ? STRIPE_PROVIDER : null,
    planCode,
    status,
    customerId: input.billingCustomerId,
    subscriptionId: input.billingSubscriptionId,
    currentPeriodEnd: input.billingCurrentPeriodEnd ? input.billingCurrentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: input.billingCancelAtPeriodEnd,
    updatedAt: input.billingUpdatedAt ? input.billingUpdatedAt.toISOString() : null,
    complimentaryPro: input.complimentaryPro,
    hasPaidAccess,
    accessReason: input.complimentaryPro ? "complimentary" : hasPaidAccess ? "billing" : null
  };
}

export function buildEffectivePaidState(input: BillingUserRecord, override?: Partial<BillingUserRecord>): boolean {
  return hasPaidBillingAccess({
    complimentaryPro: override?.complimentaryPro ?? input.complimentaryPro,
    billingPlanCode: override?.billingPlanCode ?? input.billingPlanCode,
    billingStatus: override?.billingStatus ?? input.billingStatus
  });
}

export async function getBillingAccountSnapshot(userId: string): Promise<BillingAccountSnapshot> {
  const user = await findPrimaryUserById(userId);
  if (!user) {
    throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
  }
  return buildBillingSnapshot(user as BillingUserRecord);
}

export async function setComplimentaryProAccess(userId: string, complimentaryPro: boolean) {
  const user = await findPrimaryUserById(userId);
  if (!user) {
    throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
  }

  const nextIsPaid = buildEffectivePaidState(user as BillingUserRecord, { complimentaryPro });
  return updatePrimaryUser(userId, {
    complimentaryPro,
    isPaid: nextIsPaid,
    billingUpdatedAt: new Date()
  });
}

function getPriceIdForPlan(planCode: BillingPlanCode): string {
  if (planCode === "PRO_MONTHLY" && env.stripePriceProMonthly) {
    return env.stripePriceProMonthly;
  }

  throw new AppError(errorCodes.BILLING_UNAVAILABLE, "The selected plan is not configured yet.", 503);
}

function planCodeFromStripeSubscription(subscription: Stripe.Subscription): BillingPlanCode {
  const metadataPlan = normalizeBillingPlanCode(subscription.metadata.articlepod_plan_code);
  if (metadataPlan === "PRO_MONTHLY") {
    return metadataPlan;
  }

  const priceId = subscription.items.data[0]?.price?.id;
  if (priceId && priceId === env.stripePriceProMonthly) {
    return "PRO_MONTHLY";
  }

  return "STARTER";
}

function statusFromStripeSubscription(subscription: Stripe.Subscription): BillingStatus {
  switch (subscription.status) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
      return "GRACE_PERIOD";
    case "canceled":
    case "unpaid":
    case "paused":
      return "CANCELED";
    case "incomplete":
    case "incomplete_expired":
      return "INCOMPLETE";
    default:
      return "NONE";
  }
}

async function ensureStripeCustomer(user: BillingUserRecord): Promise<string> {
  if (user.billingCustomerId) {
    return user.billingCustomerId;
  }

  const customer = await stripe().customers.create({
    email: user.email,
    name: user.name ?? undefined,
    metadata: {
      articlepod_user_id: user.id
    }
  });

  await updatePrimaryUser(user.id, {
    billingProvider: STRIPE_PROVIDER,
    billingCustomerId: customer.id,
    billingUpdatedAt: new Date()
  });

  return customer.id;
}

export async function createStripeCheckoutSession(input: { userId: string; planCode: BillingPlanCode }): Promise<string> {
  if (!isBillingCheckoutConfigured()) {
    throw new AppError(errorCodes.BILLING_UNAVAILABLE, "Billing is not configured for this environment yet.", 503);
  }

  const user = await findPrimaryUserById(input.userId);
  if (!user) {
    throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
  }

  const billingUser = user as BillingUserRecord;
  const snapshot = buildBillingSnapshot(billingUser);
  if (snapshot.hasPaidAccess && snapshot.planCode === input.planCode) {
    throw new AppError(errorCodes.INVALID_INPUT, "Pro is already active for this account.", 400);
  }

  const customerId = await ensureStripeCustomer(billingUser);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    success_url: `${env.appUrl}/app/settings?billing=success`,
    cancel_url: `${env.appUrl}/pricing?billing=canceled`,
    line_items: [
      {
        price: getPriceIdForPlan(input.planCode),
        quantity: 1
      }
    ],
    customer_update: {
      address: "auto",
      name: "auto"
    },
    metadata: {
      articlepod_user_id: user.id,
      articlepod_plan_code: input.planCode
    },
    subscription_data: {
      metadata: {
        articlepod_user_id: user.id,
        articlepod_plan_code: input.planCode
      }
    }
  });

  if (!session.url) {
    throw new AppError(errorCodes.INTERNAL_ERROR, "Stripe checkout session did not return a redirect URL.", 500);
  }

  return session.url;
}

export async function createStripeBillingPortalSession(userId: string): Promise<string> {
  if (!env.stripeSecretKey) {
    throw new AppError(errorCodes.BILLING_UNAVAILABLE, "Billing is not configured for this environment yet.", 503);
  }

  const user = await findPrimaryUserById(userId);
  if (!user) {
    throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
  }

  const customerId = (user as BillingUserRecord).billingCustomerId;
  if (!customerId) {
    throw new AppError(errorCodes.INVALID_INPUT, "No Stripe billing profile exists for this account yet.", 400);
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/app/settings`,
    ...(env.stripeBillingPortalConfigurationId ? { configuration: env.stripeBillingPortalConfigurationId } : {})
  });

  return session.url;
}

export function verifyStripeWebhookEvent(rawBody: string, signature: string | null): Stripe.Event {
  if (!env.stripeWebhookSecret) {
    throw new AppError(errorCodes.BILLING_UNAVAILABLE, "Stripe webhook handling is not configured yet.", 503);
  }
  if (!signature) {
    throw new AppError(errorCodes.INVALID_INPUT, "Missing Stripe signature.", 400);
  }

  return stripe().webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
}

async function applyCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<{ userId: string | null; customerId: string | null }> {
  const userId = typeof session.client_reference_id === "string" ? session.client_reference_id : null;
  const customerId = typeof session.customer === "string" ? session.customer : null;

  if (userId && customerId) {
    const user = await findPrimaryUserById(userId);
    if (user) {
      await updatePrimaryUser(user.id, {
        billingProvider: STRIPE_PROVIDER,
        billingCustomerId: customerId,
        billingUpdatedAt: new Date()
      });
    }
  }

  return { userId, customerId };
}

async function applySubscriptionUpdate(subscription: Stripe.Subscription): Promise<{
  userId: string | null;
  customerId: string | null;
  subscriptionId: string;
}> {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
  const subscriptionId = subscription.id;
  if (!customerId) {
    return { userId: null, customerId: null, subscriptionId };
  }

  const user = await findPrimaryUserByBillingCustomerId(customerId);
  if (!user) {
    return { userId: null, customerId, subscriptionId };
  }

  const billingPlanCode = planCodeFromStripeSubscription(subscription);
  const billingStatus = statusFromStripeSubscription(subscription);
  const billingUpdatedAt = new Date();
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end;
  await updatePrimaryUser(user.id, {
    billingProvider: STRIPE_PROVIDER,
    billingCustomerId: customerId,
    billingSubscriptionId: subscriptionId,
    billingPlanCode,
    billingStatus,
    billingCurrentPeriodEnd: typeof currentPeriodEnd === "number" ? new Date(currentPeriodEnd * 1000) : null,
    billingCancelAtPeriodEnd: subscription.cancel_at_period_end,
    billingUpdatedAt,
    isPaid: buildEffectivePaidState(user as BillingUserRecord, {
      billingPlanCode,
      billingStatus
    })
  });

  return { userId: user.id, customerId, subscriptionId };
}

export async function applyStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  const alreadyProcessed = await findPrimaryBillingWebhookEvent(STRIPE_PROVIDER, event.id);
  if (alreadyProcessed) {
    return;
  }

  let userId: string | null = null;
  let customerId: string | null = null;
  let subscriptionId: string | null = null;

  if (event.type === "checkout.session.completed") {
    const result = await applyCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
    userId = result.userId;
    customerId = result.customerId;
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const result = await applySubscriptionUpdate(event.data.object as Stripe.Subscription);
    userId = result.userId;
    customerId = result.customerId;
    subscriptionId = result.subscriptionId;
  }

  await createPrimaryBillingWebhookEvent({
    provider: STRIPE_PROVIDER,
    providerEventId: event.id,
    eventType: event.type,
    userId,
    customerId,
    subscriptionId,
    status: "PROCESSED",
    processedAt: new Date()
  });
}
