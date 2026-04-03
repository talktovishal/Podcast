import Stripe from "stripe";
import { AppError, errorCodes } from "@articlepod/core";
import { env } from "./env";
import { logger } from "./logger";
import {
  billingPaymentStatusLabel,
  billingPlanLabel,
  billingStatusLabel,
  type BillingAccountSnapshot,
  type BillingLane,
  type BillingModeState,
  type BillingEntitlementStatus,
  type BillingPaymentStatus,
  type BillingPlanAccessLevel,
  type BillingPlanCode,
  type BillingSettingsState,
  type BillingStatus
} from "./billing-contract";
import {
  createPrimaryBillingWebhookEvent,
  findPrimaryBillingWebhookEvent,
  findPrimarySandboxBillingAccountByBillingCustomerId,
  findPrimarySandboxBillingAccountByUserId,
  findPrimaryUserByBillingCustomerId,
  findPrimaryUserById,
  type PrimarySandboxBillingAccountRecord,
  updatePrimaryUser,
  upsertPrimarySandboxBillingAccount
} from "./metadata-primary-auth";

const STRIPE_PROVIDER = "stripe";
const STRIPE_LIVE_PROVIDER = "stripe_live";
const STRIPE_SANDBOX_PROVIDER = "stripe_sandbox";
const SELF_SERVE_BILLING_PLAN_CODES = ["PRO_MONTHLY", "PRO_ANNUAL"] as const;

export type SelfServeBillingPlanCode = (typeof SELF_SERVE_BILLING_PLAN_CODES)[number];
export type {
  BillingAccountSnapshot,
  BillingLane,
  BillingModeState,
  BillingEntitlementStatus,
  BillingPaymentStatus,
  BillingPlanAccessLevel,
  BillingPlanCode,
  BillingSettingsState,
  BillingStatus
} from "./billing-contract";
export { billingPaymentStatusLabel, billingPlanLabel, billingStatusLabel } from "./billing-contract";

type BillingStateRecord = {
  complimentaryPro: boolean;
  billingProvider: string | null;
  billingCustomerId: string | null;
  billingSubscriptionId: string | null;
  billingPriceId: string | null;
  billingPlanCode: string;
  billingStatus: string;
  billingEntitlementStatus: string;
  billingLastPaymentStatus: string;
  billingLastInvoiceId: string | null;
  billingCurrentPeriodEnd: Date | null;
  billingCancelAtPeriodEnd: boolean;
  billingLastStripeEventId: string | null;
  billingLastStripeEventCreatedAt: Date | null;
  billingLastSubscriptionEventAt: Date | null;
  billingLastInvoiceEventAt: Date | null;
  billingUpdatedAt: Date | null;
  isPaid: boolean;
};

type BillingUserRecord = BillingStateRecord & {
  id: string;
  email: string;
  name: string | null;
  role: string;
  billingLanePreference?: string;
};

type SandboxBillingAccountRecord = BillingStateRecord & {
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

type BillingPlanCatalogEntry = {
  planCode: SelfServeBillingPlanCode;
  label: string;
  accessLevel: BillingPlanAccessLevel;
  priceId: string | null;
};

type BillingCheckoutSessionResult = {
  url: string;
  sessionId: string;
  customerId: string;
};

type BillingPortalSessionResult = {
  url: string;
  sessionId: string;
  customerId: string;
};

type StripeWebhookApplyStatus =
  | "PROCESSED"
  | "IGNORED_DUPLICATE"
  | "IGNORED_STALE"
  | "IGNORED_NO_USER"
  | "IGNORED_UNSUPPORTED";

export type StripeWebhookApplyResult = {
  eventId: string;
  eventType: string;
  objectId: string | null;
  userId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  invoiceId: string | null;
  status: StripeWebhookApplyStatus;
};

export type StripeDashboardLinks = {
  customerUrl: string | null;
  subscriptionUrl: string | null;
  invoiceUrl: string | null;
};

type StripeExpandedInvoice = Stripe.Invoice & {
  payment_intent?: Stripe.PaymentIntent | string | null;
};

type StripeExpandedSubscription = Stripe.Subscription & {
  latest_invoice?: StripeExpandedInvoice | string | null;
};

type StripeLaneConfig = {
  lane: BillingLane;
  providerKey: string;
  externalProvider: string;
  secretKey: string | null;
  webhookSecret: string | null;
  monthlyPriceId: string | null;
  annualPriceId: string | null;
  billingPortalConfigurationId: string | null;
};

const stripeClients = new Map<BillingLane, Stripe>();

function defaultBillingStateRecord(): BillingStateRecord {
  return {
    complimentaryPro: false,
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
    isPaid: false
  };
}

function sandboxAccountToBillingState(
  account: PrimarySandboxBillingAccountRecord | null,
  userId = account?.userId ?? ""
): SandboxBillingAccountRecord {
  const defaults = defaultBillingStateRecord();
  return {
    userId,
    ...defaults,
    ...(account ?? {}),
    complimentaryPro: false,
    isPaid: false,
    createdAt: account?.createdAt ?? new Date(0),
    updatedAt: account?.updatedAt ?? new Date(0)
  };
}

function normalizeBillingLane(value: string | null | undefined): BillingLane {
  return value === "SANDBOX" ? "SANDBOX" : "LIVE";
}

function canUseSandboxBilling(user: Pick<BillingUserRecord, "email" | "role">): boolean {
  return user.role === "ADMIN" || env.billingSandboxAllowlistEmails.includes(user.email.trim().toLowerCase());
}

function selectedBillingLane(user: BillingUserRecord): BillingLane {
  return normalizeBillingLane(user.billingLanePreference);
}

function effectiveBillingLane(user: BillingUserRecord): BillingLane {
  return canUseSandboxBilling(user) ? selectedBillingLane(user) : "LIVE";
}

function stripeLaneConfig(lane: BillingLane): StripeLaneConfig {
  if (lane === "SANDBOX") {
    return {
      lane,
      providerKey: STRIPE_SANDBOX_PROVIDER,
      externalProvider: STRIPE_SANDBOX_PROVIDER,
      secretKey: env.stripeSandboxSecretKey ?? null,
      webhookSecret: env.stripeSandboxWebhookSecret ?? null,
      monthlyPriceId: env.stripeSandboxPriceProMonthly ?? null,
      annualPriceId: env.stripeSandboxPriceProAnnual ?? null,
      billingPortalConfigurationId: env.stripeSandboxBillingPortalConfigurationId ?? null
    };
  }

  return {
    lane,
    providerKey: STRIPE_LIVE_PROVIDER,
    externalProvider: STRIPE_PROVIDER,
    secretKey: env.stripeLiveSecretKey ?? null,
    webhookSecret: env.stripeLiveWebhookSecret ?? null,
    monthlyPriceId: env.stripeLivePriceProMonthly ?? null,
    annualPriceId: env.stripeLivePriceProAnnual ?? null,
    billingPortalConfigurationId: env.stripeLiveBillingPortalConfigurationId ?? null
  };
}

function isStripeBackedProvider(provider: string | null | undefined): boolean {
  return provider === STRIPE_PROVIDER || provider === STRIPE_LIVE_PROVIDER || provider === STRIPE_SANDBOX_PROVIDER;
}

function stripe(lane: BillingLane = "LIVE"): Stripe {
  const config = stripeLaneConfig(lane);
  if (!config.secretKey) {
    throw new AppError(errorCodes.BILLING_UNAVAILABLE, "Billing is not configured for this environment yet.", 503);
  }

  const cached = stripeClients.get(lane);
  if (cached) {
    return cached;
  }

  const client = new Stripe(config.secretKey);
  stripeClients.set(lane, client);
  return client;
}

function stripeDashboardBaseUrl(lane: BillingLane = "LIVE"): string {
  return stripeLaneConfig(lane).secretKey?.startsWith("sk_test_")
    ? "https://dashboard.stripe.com/test"
    : "https://dashboard.stripe.com";
}

function supportedSelfServePlanCodes(): readonly SelfServeBillingPlanCode[] {
  return SELF_SERVE_BILLING_PLAN_CODES;
}

function isSelfServeBillingPlanCode(value: string | null | undefined): value is SelfServeBillingPlanCode {
  return supportedSelfServePlanCodes().includes(value as SelfServeBillingPlanCode);
}

function billingPlanCatalogEntry(planCode: SelfServeBillingPlanCode, lane: BillingLane = "LIVE"): BillingPlanCatalogEntry {
  const config = stripeLaneConfig(lane);
  if (planCode === "PRO_MONTHLY") {
    return {
      planCode,
      label: "Pro Monthly",
      accessLevel: "PRO",
      priceId: config.monthlyPriceId ?? null
    };
  }

  if (planCode === "PRO_ANNUAL") {
    return {
      planCode,
      label: "Pro Annual",
      accessLevel: "PRO",
      priceId: config.annualPriceId ?? null
    };
  }

  throw new AppError(errorCodes.INVALID_INPUT, "Unsupported billing plan.", 400);
}

export function isBillingCheckoutConfigured(): boolean {
  return supportedSelfServePlanCodes().some((planCode) => isBillingPlanCheckoutConfigured(planCode, "LIVE")) &&
    Boolean(stripeLaneConfig("LIVE").secretKey);
}

export function isBillingPlanCheckoutConfigured(planCode: SelfServeBillingPlanCode, lane: BillingLane = "LIVE"): boolean {
  const config = stripeLaneConfig(lane);
  return Boolean(config.secretKey && billingPlanCatalogEntry(planCode, lane).priceId);
}

export function isBillingWebhookConfigured(lane: BillingLane = "LIVE"): boolean {
  const config = stripeLaneConfig(lane);
  return Boolean(config.secretKey && config.webhookSecret);
}

export function normalizeBillingPlanCode(value: string | null | undefined): BillingPlanCode {
  if (value === "PRO_MONTHLY" || value === "PRO_ANNUAL") {
    return value;
  }
  return "STARTER";
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

export function normalizeBillingPaymentStatus(value: string | null | undefined): BillingPaymentStatus {
  switch (value) {
    case "PAID":
    case "FAILED":
    case "ACTION_REQUIRED":
      return value;
    default:
      return "NONE";
  }
}

export function normalizeBillingEntitlementStatus(value: string | null | undefined): BillingEntitlementStatus {
  switch (value) {
    case "ACTIVE":
    case "GRACE_PERIOD":
      return value;
    default:
      return "INACTIVE";
  }
}

function billingIssueReason(input: {
  status: BillingStatus;
  lastPaymentStatus: BillingPaymentStatus;
  hasPaidAccess: boolean;
}): BillingAccountSnapshot["billingIssueReason"] {
  if (input.lastPaymentStatus === "FAILED") {
    return "payment_failed";
  }
  if (input.lastPaymentStatus === "ACTION_REQUIRED") {
    return "action_required";
  }
  if (input.status === "INCOMPLETE" && !input.hasPaidAccess) {
    return "activation_pending";
  }
  return null;
}

export function billingIssueMessage(input: {
  status: BillingStatus;
  lastPaymentStatus: BillingPaymentStatus;
  hasPaidAccess: boolean;
}): string | null {
  const reason = billingIssueReason(input);
  switch (reason) {
    case "payment_failed":
      return "A subscription payment failed. Update your payment method in billing to avoid losing access.";
    case "action_required":
      return "Stripe needs additional confirmation for a payment. Open billing to complete authentication or update your card.";
    case "activation_pending":
      return "Stripe is still activating this subscription. Access will update automatically after webhook confirmation.";
    default:
      return null;
  }
}

function hasNewEntitlementEvidence(input: {
  billingEntitlementStatus?: string | null;
  billingLastPaymentStatus?: string | null;
  billingLastInvoiceId?: string | null;
  billingLastStripeEventId?: string | null;
  billingPriceId?: string | null;
}): boolean {
  return Boolean(
    input.billingLastStripeEventId ||
      input.billingLastInvoiceId ||
      input.billingPriceId ||
      normalizeBillingPaymentStatus(input.billingLastPaymentStatus) !== "NONE" ||
      normalizeBillingEntitlementStatus(input.billingEntitlementStatus) !== "INACTIVE"
  );
}

function legacyEntitlementStatus(input: { billingPlanCode: string; billingStatus: string }): BillingEntitlementStatus {
  const planCode = normalizeBillingPlanCode(input.billingPlanCode);
  const status = normalizeBillingStatus(input.billingStatus);
  if (planCode !== "STARTER" && status === "ACTIVE") {
    return "ACTIVE";
  }
  if (planCode !== "STARTER" && status === "GRACE_PERIOD") {
    return "GRACE_PERIOD";
  }
  return "INACTIVE";
}

function resolvedBillingEntitlementStatus(input: {
  billingPlanCode: string;
  billingStatus: string;
  billingEntitlementStatus?: string | null;
  billingLastPaymentStatus?: string | null;
  billingLastInvoiceId?: string | null;
  billingLastStripeEventId?: string | null;
  billingPriceId?: string | null;
}): BillingEntitlementStatus {
  if (hasNewEntitlementEvidence(input)) {
    return normalizeBillingEntitlementStatus(input.billingEntitlementStatus);
  }
  return legacyEntitlementStatus(input);
}

export function hasPaidBillingAccess(input: {
  complimentaryPro: boolean;
  billingPlanCode: string;
  billingStatus: string;
  billingEntitlementStatus?: string | null;
  billingLastPaymentStatus?: string | null;
  billingLastInvoiceId?: string | null;
  billingLastStripeEventId?: string | null;
  billingPriceId?: string | null;
}): boolean {
  if (input.complimentaryPro) {
    return true;
  }

  const entitlementStatus = resolvedBillingEntitlementStatus(input);
  return entitlementStatus === "ACTIVE" || entitlementStatus === "GRACE_PERIOD";
}

export function buildBillingSnapshot(input: BillingStateRecord): BillingAccountSnapshot {
  const planCode = normalizeBillingPlanCode(input.billingPlanCode);
  const status = normalizeBillingStatus(input.billingStatus);
  const billingEntitlementStatus = resolvedBillingEntitlementStatus(input);
  const hasPaidAccess = hasPaidBillingAccess(input);
  const lastPaymentStatus = normalizeBillingPaymentStatus(input.billingLastPaymentStatus);
  const effectiveEntitlementStatus = input.complimentaryPro ? "ACTIVE" : billingEntitlementStatus;
  const planAccessLevel: BillingPlanAccessLevel = hasPaidAccess ? "PRO" : "STARTER";
  const issueMessage = billingIssueMessage({ status, lastPaymentStatus, hasPaidAccess });
  const issueReason = billingIssueReason({ status, lastPaymentStatus, hasPaidAccess });

  return {
    provider: isStripeBackedProvider(input.billingProvider) ? STRIPE_PROVIDER : null,
    planCode,
    planAccessLevel,
    status,
    entitlementStatus: effectiveEntitlementStatus,
    lastPaymentStatus,
    priceId: input.billingPriceId,
    customerId: input.billingCustomerId,
    subscriptionId: input.billingSubscriptionId,
    lastInvoiceId: input.billingLastInvoiceId,
    currentPeriodEnd: input.billingCurrentPeriodEnd ? input.billingCurrentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: input.billingCancelAtPeriodEnd,
    updatedAt: input.billingUpdatedAt ? input.billingUpdatedAt.toISOString() : null,
    complimentaryPro: input.complimentaryPro,
    hasPaidAccess,
    accessReason: input.complimentaryPro ? "complimentary" : hasPaidAccess ? "billing" : null,
    isPendingActivation: issueReason === "activation_pending",
    hasBillingIssue: issueReason === "payment_failed" || issueReason === "action_required",
    billingIssueReason: issueReason,
    billingIssueMessage: issueMessage,
    lastStripeEventId: input.billingLastStripeEventId,
    lastStripeEventCreatedAt: input.billingLastStripeEventCreatedAt ? input.billingLastStripeEventCreatedAt.toISOString() : null
  };
}

export function buildEffectivePaidState(input: BillingStateRecord, override?: Partial<BillingStateRecord>): boolean {
  return hasPaidBillingAccess({
    complimentaryPro: override?.complimentaryPro ?? input.complimentaryPro,
    billingPlanCode: override?.billingPlanCode ?? input.billingPlanCode,
    billingStatus: override?.billingStatus ?? input.billingStatus,
    billingEntitlementStatus: override?.billingEntitlementStatus ?? input.billingEntitlementStatus,
    billingLastPaymentStatus: override?.billingLastPaymentStatus ?? input.billingLastPaymentStatus,
    billingLastInvoiceId: override?.billingLastInvoiceId ?? input.billingLastInvoiceId,
    billingLastStripeEventId: override?.billingLastStripeEventId ?? input.billingLastStripeEventId,
    billingPriceId: override?.billingPriceId ?? input.billingPriceId
  });
}

export function buildStripeDashboardLinks(input: {
  provider: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  invoiceId: string | null;
  lane?: BillingLane;
}): StripeDashboardLinks {
  if (!isStripeBackedProvider(input.provider)) {
    return {
      customerUrl: null,
      subscriptionUrl: null,
      invoiceUrl: null
    };
  }

  const base = stripeDashboardBaseUrl(input.lane ?? "LIVE");
  return {
    customerUrl: input.customerId ? `${base}/customers/${input.customerId}` : null,
    subscriptionUrl: input.subscriptionId ? `${base}/subscriptions/${input.subscriptionId}` : null,
    invoiceUrl: input.invoiceId ? `${base}/invoices/${input.invoiceId}` : null
  };
}

function selectedBillingStateRecord(
  liveUser: BillingUserRecord,
  sandboxAccount: SandboxBillingAccountRecord | null,
  lane: BillingLane
): BillingStateRecord {
  return lane === "SANDBOX" ? sandboxAccountToBillingState(sandboxAccount) : liveUser;
}

export async function getBillingModeState(userId: string): Promise<BillingModeState> {
  const user = (await findPrimaryUserById(userId)) as BillingUserRecord | null;
  if (!user) {
    throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
  }

  const canUseSandbox = canUseSandboxBilling(user);
  const selectedLane = selectedBillingLane(user);
  return {
    canUseSandbox,
    selectedLane,
    effectiveLane: canUseSandbox ? selectedLane : "LIVE"
  };
}

export async function setBillingLanePreference(userId: string, lane: BillingLane): Promise<BillingModeState> {
  const user = (await findPrimaryUserById(userId)) as BillingUserRecord | null;
  if (!user) {
    throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
  }

  if (lane === "SANDBOX" && !canUseSandboxBilling(user)) {
    throw new AppError(errorCodes.UNAUTHORIZED, "Sandbox billing is not enabled for this account.", 403);
  }

  const nextLane = lane === "SANDBOX" ? "SANDBOX" : "LIVE";
  await updatePrimaryUser(userId, {
    billingLanePreference: nextLane
  });

  return {
    canUseSandbox: canUseSandboxBilling(user),
    selectedLane: nextLane,
    effectiveLane: nextLane
  };
}

export async function getBillingSettingsState(userId: string): Promise<BillingSettingsState> {
  const user = (await findPrimaryUserById(userId)) as BillingUserRecord | null;
  if (!user) {
    throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
  }

  const liveUser =
    (await reconcileBillingStateFromStripeIfNeeded(user, "LIVE", async (patch) =>
      (await updatePrimaryUser(user.id, patch)) as BillingUserRecord | null
    )) ?? user;

  const sandboxAccount = await findPrimarySandboxBillingAccountByUserId(user.id);
  const reconciledSandbox =
    (await reconcileBillingStateFromStripeIfNeeded(sandboxAccountToBillingState(sandboxAccount), "SANDBOX", async (patch) =>
      sandboxAccountToBillingState(
        await upsertPrimarySandboxBillingAccount({
          userId: user.id,
          ...patch
        })
      )
    )) ?? (sandboxAccount ? sandboxAccountToBillingState(sandboxAccount) : null);

  const mode = {
    canUseSandbox: canUseSandboxBilling(user),
    selectedLane: selectedBillingLane(user),
    effectiveLane: effectiveBillingLane(user)
  } satisfies BillingModeState;

  return {
    liveBilling: buildBillingSnapshot(liveUser),
    selectedBilling: buildBillingSnapshot(selectedBillingStateRecord(liveUser, reconciledSandbox, mode.effectiveLane)),
    sandboxBilling: reconciledSandbox ? buildBillingSnapshot(reconciledSandbox) : null,
    mode
  };
}

export async function getBillingAccountSnapshot(userId: string): Promise<BillingAccountSnapshot> {
  const state = await getBillingSettingsState(userId);
  return state.liveBilling;
}

export async function refreshBillingStateFromStripe(userId: string): Promise<void> {
  await getBillingSettingsState(userId);
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

function getPriceIdForPlan(planCode: SelfServeBillingPlanCode, lane: BillingLane = "LIVE"): string {
  const catalogEntry = billingPlanCatalogEntry(planCode, lane);
  if (catalogEntry.priceId) {
    return catalogEntry.priceId;
  }

  throw new AppError(errorCodes.BILLING_UNAVAILABLE, `The ${catalogEntry.label} plan is not configured yet.`, 503);
}

function planCodeFromPriceId(priceId: string | null | undefined, lane: BillingLane = "LIVE"): BillingPlanCode {
  const config = stripeLaneConfig(lane);
  if (!priceId) {
    return "STARTER";
  }
  if (priceId === config.monthlyPriceId) {
    return "PRO_MONTHLY";
  }
  if (priceId === config.annualPriceId) {
    return "PRO_ANNUAL";
  }
  return "STARTER";
}

function metadataPlanCode(metadata: Stripe.Metadata | null | undefined): BillingPlanCode {
  return normalizeBillingPlanCode(metadata?.articlepod_plan_code);
}

function subscriptionPriceId(subscription: Stripe.Subscription): string | null {
  return subscription.items.data[0]?.price?.id ?? null;
}

function planCodeFromStripeSubscription(subscription: Stripe.Subscription, lane: BillingLane = "LIVE"): BillingPlanCode {
  const metadataPlan = metadataPlanCode(subscription.metadata);
  if (metadataPlan !== "STARTER") {
    return metadataPlan;
  }
  return planCodeFromPriceId(subscriptionPriceId(subscription), lane);
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

function entitlementStatusFromBillingStatus(status: BillingStatus): BillingEntitlementStatus {
  if (status === "ACTIVE") {
    return "ACTIVE";
  }
  if (status === "GRACE_PERIOD") {
    return "GRACE_PERIOD";
  }
  return "INACTIVE";
}

async function ensureStripeCustomer(
  user: BillingUserRecord,
  lane: BillingLane,
  currentRecord: BillingStateRecord
): Promise<string> {
  if (currentRecord.billingCustomerId) {
    return currentRecord.billingCustomerId;
  }

  const config = stripeLaneConfig(lane);
  const customer = await stripe(lane).customers.create(
    {
      email: user.email,
      name: user.name ?? undefined,
      metadata: {
        articlepod_user_id: user.id
      }
    },
    {
      idempotencyKey: `articlepod:billing:customer:${user.id}`
    }
  );

  if (lane === "LIVE") {
    await updatePrimaryUser(user.id, {
      billingProvider: STRIPE_PROVIDER,
      billingCustomerId: customer.id,
      billingUpdatedAt: new Date()
    });
  } else {
    await upsertPrimarySandboxBillingAccount({
      userId: user.id,
      billingProvider: config.externalProvider,
      billingCustomerId: customer.id,
      billingUpdatedAt: new Date()
    });
  }

  return customer.id;
}

export async function createStripeCheckoutSession(input: {
  userId: string;
  planCode: SelfServeBillingPlanCode;
}): Promise<BillingCheckoutSessionResult> {
  if (!isSelfServeBillingPlanCode(input.planCode)) {
    throw new AppError(errorCodes.INVALID_INPUT, "Unsupported plan selection.", 400);
  }

  const user = (await findPrimaryUserById(input.userId)) as BillingUserRecord | null;
  if (!user) {
    throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
  }

  const lane = effectiveBillingLane(user);
  if (!supportedSelfServePlanCodes().some((planCode) => isBillingPlanCheckoutConfigured(planCode, lane))) {
    throw new AppError(errorCodes.BILLING_UNAVAILABLE, "Billing is not configured for this environment yet.", 503);
  }

  const sandboxAccount = lane === "SANDBOX" ? await findPrimarySandboxBillingAccountByUserId(user.id) : null;
  const billingRecord = selectedBillingStateRecord(
    user,
    sandboxAccount ? sandboxAccountToBillingState(sandboxAccount, user.id) : null,
    lane
  );
  const snapshot = buildBillingSnapshot(billingRecord);
  if (snapshot.hasPaidAccess && snapshot.planCode === input.planCode) {
    throw new AppError(errorCodes.INVALID_INPUT, `${billingPlanLabel(input.planCode)} is already active for this account.`, 400);
  }

  if (snapshot.hasPaidAccess && snapshot.planCode !== "STARTER") {
    throw new AppError(errorCodes.INVALID_INPUT, "A Pro subscription is already active. Open billing to change or cancel it.", 400);
  }

  const customerId = await ensureStripeCustomer(user, lane, billingRecord);
  const priceId = getPriceIdForPlan(input.planCode, lane);
  const session = await stripe(lane).checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      success_url: lane === "SANDBOX" ? `${env.appUrl}/app/settings?billing=success` : `${env.appUrl}/app?billing=success`,
      cancel_url: `${env.appUrl}/pricing?billing=canceled`,
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      customer_update: {
        address: "auto",
        name: "auto"
      },
      metadata: {
        articlepod_user_id: user.id,
        articlepod_plan_code: input.planCode,
        articlepod_billing_lane: lane
      },
      subscription_data: {
        metadata: {
          articlepod_user_id: user.id,
          articlepod_plan_code: input.planCode,
          articlepod_billing_lane: lane
        }
      }
    },
    {
      idempotencyKey: `articlepod:billing:checkout:${user.id}:${input.planCode}:${Math.floor(Date.now() / 60_000)}`
    }
  );

  if (!session.url) {
    throw new AppError(errorCodes.INTERNAL_ERROR, "Stripe checkout session did not return a redirect URL.", 500);
  }

  await logger.info("Billing checkout session created", {
    userId: user.id,
    billingLane: lane,
    planCode: input.planCode,
    stripeCustomerId: customerId,
    stripeSessionId: session.id,
    stripePriceId: priceId
  });

  return {
    url: session.url,
    sessionId: session.id,
    customerId
  };
}

export async function createStripeBillingPortalSession(userId: string): Promise<BillingPortalSessionResult> {
  const user = (await findPrimaryUserById(userId)) as BillingUserRecord | null;
  if (!user) {
    throw new AppError(errorCodes.UNAUTHORIZED, "Unauthorized", 401);
  }

  const lane = effectiveBillingLane(user);
  const config = stripeLaneConfig(lane);
  if (!config.secretKey) {
    throw new AppError(errorCodes.BILLING_UNAVAILABLE, "Billing is not configured for this environment yet.", 503);
  }

  const sandboxAccount = lane === "SANDBOX" ? await findPrimarySandboxBillingAccountByUserId(user.id) : null;
  const customerId = lane === "SANDBOX" ? sandboxAccount?.billingCustomerId ?? null : user.billingCustomerId;
  if (!customerId) {
    throw new AppError(errorCodes.INVALID_INPUT, "No Stripe billing profile exists for this account yet.", 400);
  }

  const session = await stripe(lane).billingPortal.sessions.create({
    customer: customerId,
    return_url: lane === "SANDBOX" ? `${env.appUrl}/app/settings` : `${env.appUrl}/app`,
    ...(config.billingPortalConfigurationId ? { configuration: config.billingPortalConfigurationId } : {})
  });

  await logger.info("Billing portal session created", {
    userId,
    billingLane: lane,
    stripeCustomerId: customerId,
    stripePortalSessionId: session.id
  });

  return {
    url: session.url,
    sessionId: session.id,
    customerId
  };
}

export function verifyStripeWebhookEvent(rawBody: string, signature: string | null, lane: BillingLane = "LIVE"): Stripe.Event {
  const config = stripeLaneConfig(lane);
  if (!config.webhookSecret) {
    throw new AppError(errorCodes.BILLING_UNAVAILABLE, "Stripe webhook handling is not configured yet.", 503);
  }
  if (!signature) {
    throw new AppError(errorCodes.INVALID_INPUT, "Missing Stripe signature.", 400);
  }

  return stripe(lane).webhooks.constructEvent(rawBody, signature, config.webhookSecret);
}

function eventCreatedAt(event: Stripe.Event): Date {
  return new Date(event.created * 1000);
}

function eventObjectId(object: Stripe.Event.Data.Object): string | null {
  return typeof (object as { id?: unknown }).id === "string" ? String((object as { id: string }).id) : null;
}

function isStaleDomainEvent(record: BillingStateRecord, event: Stripe.Event, domain: "subscription" | "invoice"): boolean {
  const createdAt = eventCreatedAt(event);
  const watermark = domain === "subscription" ? record.billingLastSubscriptionEventAt : record.billingLastInvoiceEventAt;
  return Boolean(watermark && createdAt < watermark);
}

function withBillingAuditPatch(
  record: BillingStateRecord,
  event: Stripe.Event,
  patch: Partial<BillingStateRecord>,
  domain?: "subscription" | "invoice"
): Partial<BillingStateRecord> {
  const createdAt = eventCreatedAt(event);
  const nextPatch: Partial<BillingStateRecord> = {
    ...patch,
    billingLastStripeEventId: event.id,
    billingLastStripeEventCreatedAt: createdAt,
    billingUpdatedAt: new Date()
  };

  if (domain === "subscription") {
    nextPatch.billingLastSubscriptionEventAt = createdAt;
  }
  if (domain === "invoice") {
    nextPatch.billingLastInvoiceEventAt = createdAt;
  }

  nextPatch.isPaid = buildEffectivePaidState(record, nextPatch);
  return nextPatch;
}

function sessionSubscriptionId(session: Stripe.Checkout.Session): string | null {
  if (typeof session.subscription === "string") {
    return session.subscription;
  }
  if (session.subscription && typeof session.subscription === "object" && "id" in session.subscription) {
    return typeof session.subscription.id === "string" ? session.subscription.id : null;
  }
  return null;
}

function shouldReconcileBillingStateFromStripe(record: BillingStateRecord, lane: BillingLane): boolean {
  if (record.complimentaryPro) {
    return false;
  }

  if (!stripeLaneConfig(lane).secretKey) {
    return false;
  }

  if (!isStripeBackedProvider(record.billingProvider) || !record.billingCustomerId) {
    return false;
  }

  const snapshot = buildBillingSnapshot(record);
  if (snapshot.hasPaidAccess) {
    return false;
  }

  return snapshot.planCode === "STARTER" || snapshot.isPendingActivation;
}

function stripeSubscriptionSyncPriority(status: Stripe.Subscription.Status): number {
  switch (status) {
    case "active":
    case "trialing":
      return 6;
    case "past_due":
      return 5;
    case "incomplete":
      return 4;
    case "unpaid":
      return 3;
    case "paused":
      return 2;
    case "canceled":
      return 1;
    case "incomplete_expired":
      return 0;
    default:
      return -1;
  }
}

export function selectStripeSubscriptionForSync(
  subscriptions: readonly Stripe.Subscription[]
): Stripe.Subscription | null {
  if (subscriptions.length === 0) {
    return null;
  }

  return [...subscriptions].sort((left, right) => {
    const priorityDelta = stripeSubscriptionSyncPriority(right.status) - stripeSubscriptionSyncPriority(left.status);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const rightPeriodEnd = right.items.data[0]?.current_period_end ?? 0;
    const leftPeriodEnd = left.items.data[0]?.current_period_end ?? 0;
    if (rightPeriodEnd !== leftPeriodEnd) {
      return rightPeriodEnd - leftPeriodEnd;
    }

    return right.created - left.created;
  })[0] ?? null;
}

function expandedInvoiceId(invoice: StripeExpandedInvoice | string | null | undefined): string | null {
  if (!invoice) {
    return null;
  }
  if (typeof invoice === "string") {
    return invoice;
  }
  return invoice.id;
}

function paymentStatusFromStripeSubscription(
  subscription: StripeExpandedSubscription,
  fallback: BillingPaymentStatus
): BillingPaymentStatus {
  const invoice = typeof subscription.latest_invoice === "string" ? null : subscription.latest_invoice ?? null;
  if (invoice?.status === "paid") {
    return "PAID";
  }

  const paymentIntent = invoice && typeof invoice.payment_intent !== "string" ? invoice.payment_intent : null;
  if (paymentIntent?.status === "requires_action" || paymentIntent?.status === "requires_confirmation") {
    return "ACTION_REQUIRED";
  }

  switch (subscription.status) {
    case "past_due":
    case "unpaid":
      return "FAILED";
    case "incomplete":
      return "ACTION_REQUIRED";
    case "active":
    case "trialing":
      return "PAID";
    default:
      return fallback;
  }
}

async function reconcileBillingStateFromStripeIfNeeded<T extends BillingStateRecord>(
  record: T,
  lane: BillingLane,
  persist: (patch: Partial<T>) => Promise<T | null>
): Promise<T | null> {
  if (!shouldReconcileBillingStateFromStripe(record, lane)) {
    return null;
  }

  try {
    const subscriptions = await stripe(lane).subscriptions.list({
      customer: record.billingCustomerId ?? undefined,
      status: "all",
      limit: 10,
      expand: ["data.latest_invoice.payment_intent"]
    });
    const latestSubscription = selectStripeSubscriptionForSync(subscriptions.data as StripeExpandedSubscription[]) as StripeExpandedSubscription | null;
    if (!latestSubscription) {
      return null;
    }

    const billingStatus = statusFromStripeSubscription(latestSubscription);
    const patch: Partial<T> = {
      billingProvider: stripeLaneConfig(lane).externalProvider,
      billingCustomerId: record.billingCustomerId,
      billingSubscriptionId: latestSubscription.id,
      billingPriceId: subscriptionPriceId(latestSubscription),
      billingPlanCode: planCodeFromStripeSubscription(latestSubscription, lane),
      billingStatus,
      billingEntitlementStatus: entitlementStatusFromBillingStatus(billingStatus),
      billingLastPaymentStatus: paymentStatusFromStripeSubscription(
        latestSubscription,
        normalizeBillingPaymentStatus(record.billingLastPaymentStatus)
      ),
      billingLastInvoiceId: expandedInvoiceId(latestSubscription.latest_invoice),
      billingCurrentPeriodEnd:
        typeof latestSubscription.items.data[0]?.current_period_end === "number"
          ? new Date(latestSubscription.items.data[0].current_period_end * 1000)
          : record.billingCurrentPeriodEnd,
      billingCancelAtPeriodEnd: latestSubscription.cancel_at_period_end,
      billingUpdatedAt: new Date()
    } as Partial<T>;
    patch.isPaid = buildEffectivePaidState(record, patch as Partial<BillingStateRecord>) as T["isPaid"];

    const changed =
      patch.billingSubscriptionId !== record.billingSubscriptionId ||
      patch.billingPriceId !== record.billingPriceId ||
      patch.billingPlanCode !== record.billingPlanCode ||
      patch.billingStatus !== record.billingStatus ||
      patch.billingEntitlementStatus !== record.billingEntitlementStatus ||
      patch.billingLastPaymentStatus !== record.billingLastPaymentStatus ||
      patch.billingLastInvoiceId !== record.billingLastInvoiceId ||
      patch.billingCancelAtPeriodEnd !== record.billingCancelAtPeriodEnd ||
      patch.isPaid !== record.isPaid ||
      (patch.billingCurrentPeriodEnd instanceof Date
        ? patch.billingCurrentPeriodEnd.toISOString()
        : null) !== (record.billingCurrentPeriodEnd ? record.billingCurrentPeriodEnd.toISOString() : null);

    if (!changed) {
      return null;
    }

    await logger.warn("Billing state reconciled directly from Stripe because the local cache was stale", {
      billingLane: lane,
      stripeCustomerId: record.billingCustomerId,
      stripeSubscriptionId: latestSubscription.id,
      billingPlanCode: patch.billingPlanCode,
      billingStatus: patch.billingStatus
    });

    return persist(patch);
  } catch (error) {
    await logger.warn("Billing state reconciliation from Stripe failed", {
      billingLane: lane,
      stripeCustomerId: record.billingCustomerId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function applyCheckoutSessionCompleted(event: Stripe.Event, session: Stripe.Checkout.Session): Promise<StripeWebhookApplyResult> {
  const userId = typeof session.client_reference_id === "string" ? session.client_reference_id : null;
  const customerId = typeof session.customer === "string" ? session.customer : null;
  const subscriptionId = sessionSubscriptionId(session);
  const objectId = session.id;

  if (!userId) {
    await createPrimaryBillingWebhookEvent({
      provider: STRIPE_LIVE_PROVIDER,
      providerEventId: event.id,
      eventType: event.type,
      eventCreatedAt: eventCreatedAt(event),
      objectId,
      customerId,
      subscriptionId,
      status: "IGNORED_NO_USER",
      errorMessage: "checkout.session.completed did not include a local user reference.",
      processedAt: new Date()
    });
    return {
      eventId: event.id,
      eventType: event.type,
      objectId,
      userId: null,
      customerId,
      subscriptionId,
      invoiceId: null,
      status: "IGNORED_NO_USER"
    };
  }

  const user = await findPrimaryUserById(userId);
  if (!user) {
    await createPrimaryBillingWebhookEvent({
      provider: STRIPE_LIVE_PROVIDER,
      providerEventId: event.id,
      eventType: event.type,
      eventCreatedAt: eventCreatedAt(event),
      objectId,
      userId,
      customerId,
      subscriptionId,
      status: "IGNORED_NO_USER",
      errorMessage: "checkout.session.completed referenced a user that does not exist locally.",
      processedAt: new Date()
    });
    return {
      eventId: event.id,
      eventType: event.type,
      objectId,
      userId,
      customerId,
      subscriptionId,
      invoiceId: null,
      status: "IGNORED_NO_USER"
    };
  }

  const billingUser = user as BillingUserRecord;
  const patch = withBillingAuditPatch(billingUser, event, {
    billingProvider: STRIPE_PROVIDER,
    billingCustomerId: customerId,
    billingSubscriptionId: subscriptionId,
    billingPlanCode: metadataPlanCode(session.metadata),
    billingStatus: buildBillingSnapshot(billingUser).hasPaidAccess ? billingUser.billingStatus : "INCOMPLETE"
  });

  await updatePrimaryUser(userId, patch);
  await createPrimaryBillingWebhookEvent({
    provider: STRIPE_LIVE_PROVIDER,
    providerEventId: event.id,
    eventType: event.type,
    eventCreatedAt: eventCreatedAt(event),
    objectId,
    userId,
    customerId,
    subscriptionId,
    status: "PROCESSED",
    processedAt: new Date()
  });

  return {
    eventId: event.id,
    eventType: event.type,
    objectId,
    userId,
    customerId,
    subscriptionId,
    invoiceId: null,
    status: "PROCESSED"
  };
}

async function findUserForSubscription(subscription: Stripe.Subscription): Promise<{
  user: BillingUserRecord | null;
  userId: string | null;
  customerId: string | null;
}> {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
  const metadataUserId = typeof subscription.metadata?.articlepod_user_id === "string" ? subscription.metadata.articlepod_user_id : null;

  const user = (customerId ? await findPrimaryUserByBillingCustomerId(customerId) : null) ?? (metadataUserId ? await findPrimaryUserById(metadataUserId) : null);
  return {
    user: (user as BillingUserRecord | null) ?? null,
    userId: user?.id ?? metadataUserId ?? null,
    customerId
  };
}

async function applySubscriptionUpdate(event: Stripe.Event, subscription: Stripe.Subscription): Promise<StripeWebhookApplyResult> {
  const { user, userId, customerId } = await findUserForSubscription(subscription);
  const subscriptionId = subscription.id;
  const objectId = subscription.id;

  if (!user) {
    await createPrimaryBillingWebhookEvent({
      provider: STRIPE_LIVE_PROVIDER,
      providerEventId: event.id,
      eventType: event.type,
      eventCreatedAt: eventCreatedAt(event),
      objectId,
      userId,
      customerId,
      subscriptionId,
      status: "IGNORED_NO_USER",
      errorMessage: "Subscription webhook could not be matched to a local user.",
      processedAt: new Date()
    });
    return {
      eventId: event.id,
      eventType: event.type,
      objectId,
      userId,
      customerId,
      subscriptionId,
      invoiceId: null,
      status: "IGNORED_NO_USER"
    };
  }

  if (isStaleDomainEvent(user, event, "subscription")) {
    await createPrimaryBillingWebhookEvent({
      provider: STRIPE_LIVE_PROVIDER,
      providerEventId: event.id,
      eventType: event.type,
      eventCreatedAt: eventCreatedAt(event),
      objectId,
      userId: user.id,
      customerId,
      subscriptionId,
      status: "IGNORED_STALE",
      errorMessage: "Older subscription event arrived after a newer subscription event was already applied.",
      processedAt: new Date()
    });
    return {
      eventId: event.id,
      eventType: event.type,
      objectId,
      userId: user.id,
      customerId,
      subscriptionId,
      invoiceId: null,
      status: "IGNORED_STALE"
    };
  }

  const billingPlanCode = planCodeFromStripeSubscription(subscription);
  const billingStatus = statusFromStripeSubscription(subscription);
  const billingEntitlementStatus = entitlementStatusFromBillingStatus(billingStatus);
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end;
  const patch = withBillingAuditPatch(
    user,
    event,
    {
      billingProvider: STRIPE_PROVIDER,
      billingCustomerId: customerId,
      billingSubscriptionId: subscriptionId,
      billingPriceId: subscriptionPriceId(subscription),
      billingPlanCode,
      billingStatus,
      billingEntitlementStatus,
      billingCurrentPeriodEnd: typeof currentPeriodEnd === "number" ? new Date(currentPeriodEnd * 1000) : null,
      billingCancelAtPeriodEnd: subscription.cancel_at_period_end
    },
    "subscription"
  );

  await updatePrimaryUser(user.id, patch);
  await createPrimaryBillingWebhookEvent({
    provider: STRIPE_LIVE_PROVIDER,
    providerEventId: event.id,
    eventType: event.type,
    eventCreatedAt: eventCreatedAt(event),
    objectId,
    userId: user.id,
    customerId,
    subscriptionId,
    status: "PROCESSED",
    processedAt: new Date()
  });

  return {
    eventId: event.id,
    eventType: event.type,
    objectId,
    userId: user.id,
    customerId,
    subscriptionId,
    invoiceId: null,
    status: "PROCESSED"
  };
}

function invoiceCustomerId(invoice: Stripe.Invoice): string | null {
  return typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return typeof subscription === "string" ? subscription : subscription?.id ?? null;
}

function invoiceMetadataPlanCode(invoice: Stripe.Invoice): BillingPlanCode {
  return metadataPlanCode(invoice.parent?.subscription_details?.metadata);
}

function invoicePriceId(invoice: Stripe.Invoice): string | null {
  const subscriptionLine = invoice.lines.data.find((line) => {
    const subscriptionId = typeof line.subscription === "string" ? line.subscription : line.subscription?.id ?? null;
    return Boolean(subscriptionId);
  });
  const price = subscriptionLine?.pricing?.price_details?.price;
  return typeof price === "string" ? price : price?.id ?? null;
}

function invoiceCurrentPeriodEnd(invoice: Stripe.Invoice): Date | null {
  let maxPeriodEnd = 0;
  for (const line of invoice.lines.data) {
    if (line.period?.end && line.period.end > maxPeriodEnd) {
      maxPeriodEnd = line.period.end;
    }
  }
  if (maxPeriodEnd > 0) {
    return new Date(maxPeriodEnd * 1000);
  }
  return typeof invoice.period_end === "number" ? new Date(invoice.period_end * 1000) : null;
}

async function findUserForInvoice(invoice: Stripe.Invoice): Promise<{
  user: BillingUserRecord | null;
  customerId: string | null;
  subscriptionId: string | null;
}> {
  const customerId = invoiceCustomerId(invoice);
  const subscriptionId = invoiceSubscriptionId(invoice);
  const metadataUserId =
    typeof invoice.parent?.subscription_details?.metadata?.articlepod_user_id === "string"
      ? invoice.parent.subscription_details.metadata.articlepod_user_id
      : null;

  const user = (customerId ? await findPrimaryUserByBillingCustomerId(customerId) : null) ?? (metadataUserId ? await findPrimaryUserById(metadataUserId) : null);
  return {
    user: (user as BillingUserRecord | null) ?? null,
    customerId,
    subscriptionId
  };
}

function initialInvoiceFailure(record: BillingStateRecord, invoice: Stripe.Invoice): boolean {
  return invoice.billing_reason === "subscription_create" && normalizeBillingStatus(record.billingStatus) !== "ACTIVE";
}

async function applyInvoiceEvent(event: Stripe.Event, invoice: Stripe.Invoice): Promise<StripeWebhookApplyResult> {
  const { user, customerId, subscriptionId } = await findUserForInvoice(invoice);
  const invoiceId = invoice.id;
  const objectId = invoice.id;

  if (!user) {
    await createPrimaryBillingWebhookEvent({
      provider: STRIPE_LIVE_PROVIDER,
      providerEventId: event.id,
      eventType: event.type,
      eventCreatedAt: eventCreatedAt(event),
      objectId,
      customerId,
      subscriptionId,
      invoiceId,
      status: "IGNORED_NO_USER",
      errorMessage: "Invoice webhook could not be matched to a local user.",
      processedAt: new Date()
    });
    return {
      eventId: event.id,
      eventType: event.type,
      objectId,
      userId: null,
      customerId,
      subscriptionId,
      invoiceId,
      status: "IGNORED_NO_USER"
    };
  }

  if (isStaleDomainEvent(user, event, "invoice")) {
    await createPrimaryBillingWebhookEvent({
      provider: STRIPE_LIVE_PROVIDER,
      providerEventId: event.id,
      eventType: event.type,
      eventCreatedAt: eventCreatedAt(event),
      objectId,
      userId: user.id,
      customerId,
      subscriptionId,
      invoiceId,
      status: "IGNORED_STALE",
      errorMessage: "Older invoice event arrived after a newer invoice event was already applied.",
      processedAt: new Date()
    });
    return {
      eventId: event.id,
      eventType: event.type,
      objectId,
      userId: user.id,
      customerId,
      subscriptionId,
      invoiceId,
      status: "IGNORED_STALE"
    };
  }

  const nextPlanCode = (() => {
    const metadataPlan = invoiceMetadataPlanCode(invoice);
    if (metadataPlan !== "STARTER") {
      return metadataPlan;
    }
    return planCodeFromPriceId(invoicePriceId(invoice)) || normalizeBillingPlanCode(user.billingPlanCode);
  })();
  const nextPriceId = invoicePriceId(invoice) ?? user.billingPriceId;
  const nextPeriodEnd = invoiceCurrentPeriodEnd(invoice) ?? user.billingCurrentPeriodEnd;

  let patch: Partial<BillingUserRecord>;
  if (event.type === "invoice.paid") {
    patch = withBillingAuditPatch(
      user,
      event,
      {
        billingProvider: STRIPE_PROVIDER,
        billingCustomerId: customerId,
        billingSubscriptionId: subscriptionId ?? user.billingSubscriptionId,
        billingPriceId: nextPriceId,
        billingPlanCode: nextPlanCode,
        billingStatus: nextPlanCode !== "STARTER" ? "ACTIVE" : normalizeBillingStatus(user.billingStatus),
        billingEntitlementStatus: nextPlanCode !== "STARTER" ? "ACTIVE" : "INACTIVE",
        billingLastPaymentStatus: "PAID",
        billingLastInvoiceId: invoiceId,
        billingCurrentPeriodEnd: nextPeriodEnd
      },
      "invoice"
    );
  } else {
    const pendingFirstPayment = initialInvoiceFailure(user, invoice);
    const issueStatus: BillingStatus = pendingFirstPayment ? "INCOMPLETE" : "GRACE_PERIOD";
    const issueEntitlementStatus: BillingEntitlementStatus = pendingFirstPayment ? "INACTIVE" : "GRACE_PERIOD";
    const paymentStatus: BillingPaymentStatus = event.type === "invoice.payment_failed" ? "FAILED" : "ACTION_REQUIRED";

    patch = withBillingAuditPatch(
      user,
      event,
      {
        billingProvider: STRIPE_PROVIDER,
        billingCustomerId: customerId,
        billingSubscriptionId: subscriptionId ?? user.billingSubscriptionId,
        billingPriceId: nextPriceId,
        billingPlanCode: nextPlanCode,
        billingStatus: issueStatus,
        billingEntitlementStatus: issueEntitlementStatus,
        billingLastPaymentStatus: paymentStatus,
        billingLastInvoiceId: invoiceId,
        billingCurrentPeriodEnd: nextPeriodEnd
      },
      "invoice"
    );
  }

  await updatePrimaryUser(user.id, patch);
  await createPrimaryBillingWebhookEvent({
    provider: STRIPE_LIVE_PROVIDER,
    providerEventId: event.id,
    eventType: event.type,
    eventCreatedAt: eventCreatedAt(event),
    objectId,
    userId: user.id,
    customerId,
    subscriptionId,
    invoiceId,
    status: "PROCESSED",
    processedAt: new Date()
  });

  return {
    eventId: event.id,
    eventType: event.type,
    objectId,
    userId: user.id,
    customerId,
    subscriptionId,
    invoiceId,
    status: "PROCESSED"
  };
}

async function applyLiveStripeWebhookEvent(event: Stripe.Event): Promise<StripeWebhookApplyResult> {
  const alreadyProcessed = await findPrimaryBillingWebhookEvent(STRIPE_LIVE_PROVIDER, event.id);
  if (alreadyProcessed) {
    return {
      eventId: event.id,
      eventType: event.type,
      objectId: eventObjectId(event.data.object),
      userId: alreadyProcessed.userId ?? null,
      customerId: alreadyProcessed.customerId ?? null,
      subscriptionId: alreadyProcessed.subscriptionId ?? null,
      invoiceId: "invoiceId" in alreadyProcessed ? ((alreadyProcessed as { invoiceId?: string | null }).invoiceId ?? null) : null,
      status: "IGNORED_DUPLICATE"
    };
  }

  switch (event.type) {
    case "checkout.session.completed":
      return applyCheckoutSessionCompleted(event, event.data.object as Stripe.Checkout.Session);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return applySubscriptionUpdate(event, event.data.object as Stripe.Subscription);
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.payment_action_required":
      return applyInvoiceEvent(event, event.data.object as Stripe.Invoice);
    default: {
      const objectId = eventObjectId(event.data.object);
      await createPrimaryBillingWebhookEvent({
        provider: STRIPE_LIVE_PROVIDER,
        providerEventId: event.id,
        eventType: event.type,
        eventCreatedAt: eventCreatedAt(event),
        objectId,
        status: "IGNORED_UNSUPPORTED",
        errorMessage: "Stripe event type is not handled by the billing sync layer.",
        processedAt: new Date()
      });
      return {
        eventId: event.id,
        eventType: event.type,
        objectId,
        userId: null,
        customerId: null,
        subscriptionId: null,
        invoiceId: null,
        status: "IGNORED_UNSUPPORTED"
      };
    }
  }
}

async function applySandboxCheckoutSessionCompleted(
  event: Stripe.Event,
  session: Stripe.Checkout.Session
): Promise<StripeWebhookApplyResult> {
  const userId = typeof session.client_reference_id === "string" ? session.client_reference_id : null;
  const customerId = typeof session.customer === "string" ? session.customer : null;
  const subscriptionId = sessionSubscriptionId(session);
  const objectId = session.id;

  if (!userId) {
    await createPrimaryBillingWebhookEvent({
      provider: STRIPE_SANDBOX_PROVIDER,
      providerEventId: event.id,
      eventType: event.type,
      eventCreatedAt: eventCreatedAt(event),
      objectId,
      customerId,
      subscriptionId,
      status: "IGNORED_NO_USER",
      errorMessage: "Sandbox checkout.session.completed did not include a local user reference.",
      processedAt: new Date()
    });
    return {
      eventId: event.id,
      eventType: event.type,
      objectId,
      userId: null,
      customerId,
      subscriptionId,
      invoiceId: null,
      status: "IGNORED_NO_USER"
    };
  }

  const user = (await findPrimaryUserById(userId)) as BillingUserRecord | null;
  if (!user) {
    await createPrimaryBillingWebhookEvent({
      provider: STRIPE_SANDBOX_PROVIDER,
      providerEventId: event.id,
      eventType: event.type,
      eventCreatedAt: eventCreatedAt(event),
      objectId,
      userId,
      customerId,
      subscriptionId,
      status: "IGNORED_NO_USER",
      errorMessage: "Sandbox checkout.session.completed referenced a user that does not exist locally.",
      processedAt: new Date()
    });
    return {
      eventId: event.id,
      eventType: event.type,
      objectId,
      userId,
      customerId,
      subscriptionId,
      invoiceId: null,
      status: "IGNORED_NO_USER"
    };
  }

  const currentAccount = await findPrimarySandboxBillingAccountByUserId(user.id);
  const sandboxRecord = sandboxAccountToBillingState(currentAccount, user.id);
  const patch = withBillingAuditPatch(sandboxRecord, event, {
    billingProvider: STRIPE_SANDBOX_PROVIDER,
    billingCustomerId: customerId,
    billingSubscriptionId: subscriptionId,
    billingPlanCode: metadataPlanCode(session.metadata),
    billingStatus: buildBillingSnapshot(sandboxRecord).hasPaidAccess ? sandboxRecord.billingStatus : "INCOMPLETE"
  });

  await upsertPrimarySandboxBillingAccount({
    userId: user.id,
    ...patch
  });
  await createPrimaryBillingWebhookEvent({
    provider: STRIPE_SANDBOX_PROVIDER,
    providerEventId: event.id,
    eventType: event.type,
    eventCreatedAt: eventCreatedAt(event),
    objectId,
    userId,
    customerId,
    subscriptionId,
    status: "PROCESSED",
    processedAt: new Date()
  });

  return {
    eventId: event.id,
    eventType: event.type,
    objectId,
    userId,
    customerId,
    subscriptionId,
    invoiceId: null,
    status: "PROCESSED"
  };
}

async function findSandboxUserForSubscription(subscription: Stripe.Subscription): Promise<{
  user: BillingUserRecord | null;
  sandboxRecord: SandboxBillingAccountRecord | null;
  userId: string | null;
  customerId: string | null;
}> {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
  const metadataUserId = typeof subscription.metadata?.articlepod_user_id === "string" ? subscription.metadata.articlepod_user_id : null;
  const sandboxAccount = customerId ? await findPrimarySandboxBillingAccountByBillingCustomerId(customerId) : null;
  const userId = sandboxAccount?.userId ?? metadataUserId ?? null;
  const user = userId ? ((await findPrimaryUserById(userId)) as BillingUserRecord | null) : null;
  return {
    user,
    sandboxRecord: sandboxAccount ? sandboxAccountToBillingState(sandboxAccount, sandboxAccount.userId) : null,
    userId,
    customerId
  };
}

async function applySandboxSubscriptionUpdate(
  event: Stripe.Event,
  subscription: Stripe.Subscription
): Promise<StripeWebhookApplyResult> {
  const { user, sandboxRecord, userId, customerId } = await findSandboxUserForSubscription(subscription);
  const subscriptionId = subscription.id;
  const objectId = subscription.id;

  if (!user || !userId) {
    await createPrimaryBillingWebhookEvent({
      provider: STRIPE_SANDBOX_PROVIDER,
      providerEventId: event.id,
      eventType: event.type,
      eventCreatedAt: eventCreatedAt(event),
      objectId,
      userId,
      customerId,
      subscriptionId,
      status: "IGNORED_NO_USER",
      errorMessage: "Sandbox subscription webhook could not be matched to a local user.",
      processedAt: new Date()
    });
    return {
      eventId: event.id,
      eventType: event.type,
      objectId,
      userId,
      customerId,
      subscriptionId,
      invoiceId: null,
      status: "IGNORED_NO_USER"
    };
  }

  const currentRecord = sandboxRecord ?? sandboxAccountToBillingState(null, userId);
  if (isStaleDomainEvent(currentRecord, event, "subscription")) {
    await createPrimaryBillingWebhookEvent({
      provider: STRIPE_SANDBOX_PROVIDER,
      providerEventId: event.id,
      eventType: event.type,
      eventCreatedAt: eventCreatedAt(event),
      objectId,
      userId,
      customerId,
      subscriptionId,
      status: "IGNORED_STALE",
      errorMessage: "Older sandbox subscription event arrived after a newer one was already applied.",
      processedAt: new Date()
    });
    return {
      eventId: event.id,
      eventType: event.type,
      objectId,
      userId,
      customerId,
      subscriptionId,
      invoiceId: null,
      status: "IGNORED_STALE"
    };
  }

  const billingPlanCode = planCodeFromStripeSubscription(subscription, "SANDBOX");
  const billingStatus = statusFromStripeSubscription(subscription);
  const billingEntitlementStatus = entitlementStatusFromBillingStatus(billingStatus);
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end;
  const patch = withBillingAuditPatch(
    currentRecord,
    event,
    {
      billingProvider: STRIPE_SANDBOX_PROVIDER,
      billingCustomerId: customerId,
      billingSubscriptionId: subscriptionId,
      billingPriceId: subscriptionPriceId(subscription),
      billingPlanCode,
      billingStatus,
      billingEntitlementStatus,
      billingCurrentPeriodEnd: typeof currentPeriodEnd === "number" ? new Date(currentPeriodEnd * 1000) : null,
      billingCancelAtPeriodEnd: subscription.cancel_at_period_end
    },
    "subscription"
  );

  await upsertPrimarySandboxBillingAccount({
    userId,
    ...patch
  });
  await createPrimaryBillingWebhookEvent({
    provider: STRIPE_SANDBOX_PROVIDER,
    providerEventId: event.id,
    eventType: event.type,
    eventCreatedAt: eventCreatedAt(event),
    objectId,
    userId,
    customerId,
    subscriptionId,
    status: "PROCESSED",
    processedAt: new Date()
  });

  return {
    eventId: event.id,
    eventType: event.type,
    objectId,
    userId,
    customerId,
    subscriptionId,
    invoiceId: null,
    status: "PROCESSED"
  };
}

async function findSandboxUserForInvoice(invoice: Stripe.Invoice): Promise<{
  user: BillingUserRecord | null;
  sandboxRecord: SandboxBillingAccountRecord | null;
  customerId: string | null;
  subscriptionId: string | null;
}> {
  const customerId = invoiceCustomerId(invoice);
  const subscriptionId = invoiceSubscriptionId(invoice);
  const metadataUserId =
    typeof invoice.parent?.subscription_details?.metadata?.articlepod_user_id === "string"
      ? invoice.parent.subscription_details.metadata.articlepod_user_id
      : null;
  const sandboxAccount = customerId ? await findPrimarySandboxBillingAccountByBillingCustomerId(customerId) : null;
  const userId = sandboxAccount?.userId ?? metadataUserId ?? null;
  const user = userId ? ((await findPrimaryUserById(userId)) as BillingUserRecord | null) : null;

  return {
    user,
    sandboxRecord: userId ? sandboxAccountToBillingState(sandboxAccount, userId) : null,
    customerId,
    subscriptionId
  };
}

async function applySandboxInvoiceEvent(event: Stripe.Event, invoice: Stripe.Invoice): Promise<StripeWebhookApplyResult> {
  const { user, sandboxRecord, customerId, subscriptionId } = await findSandboxUserForInvoice(invoice);
  const invoiceId = invoice.id;
  const objectId = invoice.id;
  const userId = user?.id ?? sandboxRecord?.userId ?? null;

  if (!userId) {
    await createPrimaryBillingWebhookEvent({
      provider: STRIPE_SANDBOX_PROVIDER,
      providerEventId: event.id,
      eventType: event.type,
      eventCreatedAt: eventCreatedAt(event),
      objectId,
      customerId,
      subscriptionId,
      invoiceId,
      status: "IGNORED_NO_USER",
      errorMessage: "Sandbox invoice webhook could not be matched to a local user.",
      processedAt: new Date()
    });
    return {
      eventId: event.id,
      eventType: event.type,
      objectId,
      userId: null,
      customerId,
      subscriptionId,
      invoiceId,
      status: "IGNORED_NO_USER"
    };
  }

  const currentRecord = sandboxRecord ?? sandboxAccountToBillingState(null, userId);
  if (isStaleDomainEvent(currentRecord, event, "invoice")) {
    await createPrimaryBillingWebhookEvent({
      provider: STRIPE_SANDBOX_PROVIDER,
      providerEventId: event.id,
      eventType: event.type,
      eventCreatedAt: eventCreatedAt(event),
      objectId,
      userId,
      customerId,
      subscriptionId,
      invoiceId,
      status: "IGNORED_STALE",
      errorMessage: "Older sandbox invoice event arrived after a newer one was already applied.",
      processedAt: new Date()
    });
    return {
      eventId: event.id,
      eventType: event.type,
      objectId,
      userId,
      customerId,
      subscriptionId,
      invoiceId,
      status: "IGNORED_STALE"
    };
  }

  const nextPlanCode = (() => {
    const metadataPlan = invoiceMetadataPlanCode(invoice);
    if (metadataPlan !== "STARTER") {
      return metadataPlan;
    }
    return planCodeFromPriceId(invoicePriceId(invoice), "SANDBOX") || normalizeBillingPlanCode(currentRecord.billingPlanCode);
  })();
  const nextPriceId = invoicePriceId(invoice) ?? currentRecord.billingPriceId;
  const nextPeriodEnd = invoiceCurrentPeriodEnd(invoice) ?? currentRecord.billingCurrentPeriodEnd;

  let patch: Partial<BillingStateRecord>;
  if (event.type === "invoice.paid") {
    patch = withBillingAuditPatch(
      currentRecord,
      event,
      {
        billingProvider: STRIPE_SANDBOX_PROVIDER,
        billingCustomerId: customerId,
        billingSubscriptionId: subscriptionId ?? currentRecord.billingSubscriptionId,
        billingPriceId: nextPriceId,
        billingPlanCode: nextPlanCode,
        billingStatus: nextPlanCode !== "STARTER" ? "ACTIVE" : normalizeBillingStatus(currentRecord.billingStatus),
        billingEntitlementStatus: nextPlanCode !== "STARTER" ? "ACTIVE" : "INACTIVE",
        billingLastPaymentStatus: "PAID",
        billingLastInvoiceId: invoiceId,
        billingCurrentPeriodEnd: nextPeriodEnd
      },
      "invoice"
    );
  } else {
    const pendingFirstPayment = initialInvoiceFailure(currentRecord, invoice);
    const issueStatus: BillingStatus = pendingFirstPayment ? "INCOMPLETE" : "GRACE_PERIOD";
    const issueEntitlementStatus: BillingEntitlementStatus = pendingFirstPayment ? "INACTIVE" : "GRACE_PERIOD";
    const paymentStatus: BillingPaymentStatus = event.type === "invoice.payment_failed" ? "FAILED" : "ACTION_REQUIRED";

    patch = withBillingAuditPatch(
      currentRecord,
      event,
      {
        billingProvider: STRIPE_SANDBOX_PROVIDER,
        billingCustomerId: customerId,
        billingSubscriptionId: subscriptionId ?? currentRecord.billingSubscriptionId,
        billingPriceId: nextPriceId,
        billingPlanCode: nextPlanCode,
        billingStatus: issueStatus,
        billingEntitlementStatus: issueEntitlementStatus,
        billingLastPaymentStatus: paymentStatus,
        billingLastInvoiceId: invoiceId,
        billingCurrentPeriodEnd: nextPeriodEnd
      },
      "invoice"
    );
  }

  await upsertPrimarySandboxBillingAccount({
    userId,
    ...patch
  });
  await createPrimaryBillingWebhookEvent({
    provider: STRIPE_SANDBOX_PROVIDER,
    providerEventId: event.id,
    eventType: event.type,
    eventCreatedAt: eventCreatedAt(event),
    objectId,
    userId,
    customerId,
    subscriptionId,
    invoiceId,
    status: "PROCESSED",
    processedAt: new Date()
  });

  return {
    eventId: event.id,
    eventType: event.type,
    objectId,
    userId,
    customerId,
    subscriptionId,
    invoiceId,
    status: "PROCESSED"
  };
}

async function applySandboxStripeWebhookEvent(event: Stripe.Event): Promise<StripeWebhookApplyResult> {
  const alreadyProcessed = await findPrimaryBillingWebhookEvent(STRIPE_SANDBOX_PROVIDER, event.id);
  if (alreadyProcessed) {
    return {
      eventId: event.id,
      eventType: event.type,
      objectId: eventObjectId(event.data.object),
      userId: alreadyProcessed.userId ?? null,
      customerId: alreadyProcessed.customerId ?? null,
      subscriptionId: alreadyProcessed.subscriptionId ?? null,
      invoiceId: "invoiceId" in alreadyProcessed ? ((alreadyProcessed as { invoiceId?: string | null }).invoiceId ?? null) : null,
      status: "IGNORED_DUPLICATE"
    };
  }

  switch (event.type) {
    case "checkout.session.completed":
      return applySandboxCheckoutSessionCompleted(event, event.data.object as Stripe.Checkout.Session);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return applySandboxSubscriptionUpdate(event, event.data.object as Stripe.Subscription);
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.payment_action_required":
      return applySandboxInvoiceEvent(event, event.data.object as Stripe.Invoice);
    default: {
      const objectId = eventObjectId(event.data.object);
      await createPrimaryBillingWebhookEvent({
        provider: STRIPE_SANDBOX_PROVIDER,
        providerEventId: event.id,
        eventType: event.type,
        eventCreatedAt: eventCreatedAt(event),
        objectId,
        status: "IGNORED_UNSUPPORTED",
        errorMessage: "Stripe event type is not handled by the sandbox billing sync layer.",
        processedAt: new Date()
      });
      return {
        eventId: event.id,
        eventType: event.type,
        objectId,
        userId: null,
        customerId: null,
        subscriptionId: null,
        invoiceId: null,
        status: "IGNORED_UNSUPPORTED"
      };
    }
  }
}

export async function applyStripeWebhookEvent(
  event: Stripe.Event,
  lane: BillingLane = "LIVE"
): Promise<StripeWebhookApplyResult> {
  return lane === "SANDBOX" ? applySandboxStripeWebhookEvent(event) : applyLiveStripeWebhookEvent(event);
}
