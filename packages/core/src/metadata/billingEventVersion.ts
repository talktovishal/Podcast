export type BillingEventVersion = {
  billingLastStripeEventId: string | null;
  billingLastSubscriptionEventAt: Date | null;
  billingLastInvoiceEventAt: Date | null;
  billingUpdatedAt: Date | null;
};

export function billingEventVersion(record: BillingEventVersion): BillingEventVersion {
  return {
    billingLastStripeEventId: record.billingLastStripeEventId,
    billingLastSubscriptionEventAt: record.billingLastSubscriptionEventAt,
    billingLastInvoiceEventAt: record.billingLastInvoiceEventAt,
    billingUpdatedAt: record.billingUpdatedAt
  };
}

export function matchesBillingEventVersion(record: BillingEventVersion, expected: BillingEventVersion): boolean {
  return record.billingLastStripeEventId === expected.billingLastStripeEventId &&
    record.billingLastSubscriptionEventAt?.getTime() === expected.billingLastSubscriptionEventAt?.getTime() &&
    record.billingLastInvoiceEventAt?.getTime() === expected.billingLastInvoiceEventAt?.getTime() &&
    record.billingUpdatedAt?.getTime() === expected.billingUpdatedAt?.getTime();
}
