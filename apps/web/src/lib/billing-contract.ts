export type BillingPlanCode = "STARTER" | "PRO_MONTHLY" | "PRO_ANNUAL";
export type BillingPlanAccessLevel = "STARTER" | "PRO";
export type BillingStatus = "NONE" | "ACTIVE" | "GRACE_PERIOD" | "CANCELED" | "INCOMPLETE";
export type BillingPaymentStatus = "NONE" | "PAID" | "FAILED" | "ACTION_REQUIRED";
export type BillingEntitlementStatus = "INACTIVE" | "ACTIVE" | "GRACE_PERIOD";

export type BillingAccountSnapshot = {
  provider: "stripe" | null;
  planCode: BillingPlanCode;
  planAccessLevel: BillingPlanAccessLevel;
  status: BillingStatus;
  entitlementStatus: BillingEntitlementStatus;
  lastPaymentStatus: BillingPaymentStatus;
  priceId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  lastInvoiceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: string | null;
  complimentaryPro: boolean;
  hasPaidAccess: boolean;
  accessReason: "billing" | "complimentary" | null;
  isPendingActivation: boolean;
  hasBillingIssue: boolean;
  billingIssueReason: "payment_failed" | "action_required" | "activation_pending" | null;
  billingIssueMessage: string | null;
  lastStripeEventId: string | null;
  lastStripeEventCreatedAt: string | null;
};

export function billingPlanLabel(planCode: BillingPlanCode): string {
  switch (planCode) {
    case "PRO_MONTHLY":
      return "Pro Monthly";
    case "PRO_ANNUAL":
      return "Pro Annual";
    default:
      return "Starter";
  }
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

export function billingPaymentStatusLabel(status: BillingPaymentStatus): string {
  switch (status) {
    case "PAID":
      return "Paid";
    case "FAILED":
      return "Payment failed";
    case "ACTION_REQUIRED":
      return "Action required";
    default:
      return "No invoice yet";
  }
}
