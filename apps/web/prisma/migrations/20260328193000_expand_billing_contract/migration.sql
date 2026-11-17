ALTER TABLE "User" ADD COLUMN "billingPriceId" TEXT;
ALTER TABLE "User" ADD COLUMN "billingEntitlementStatus" TEXT NOT NULL DEFAULT 'INACTIVE';
ALTER TABLE "User" ADD COLUMN "billingLastPaymentStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "User" ADD COLUMN "billingLastInvoiceId" TEXT;
ALTER TABLE "User" ADD COLUMN "billingLastStripeEventId" TEXT;
ALTER TABLE "User" ADD COLUMN "billingLastStripeEventCreatedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "billingLastSubscriptionEventAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "billingLastInvoiceEventAt" DATETIME;

ALTER TABLE "BillingWebhookEvent" ADD COLUMN "eventCreatedAt" DATETIME;
ALTER TABLE "BillingWebhookEvent" ADD COLUMN "objectId" TEXT;
ALTER TABLE "BillingWebhookEvent" ADD COLUMN "invoiceId" TEXT;

CREATE INDEX "BillingWebhookEvent_subscriptionId_createdAt_idx" ON "BillingWebhookEvent"("subscriptionId", "createdAt");
CREATE INDEX "BillingWebhookEvent_invoiceId_createdAt_idx" ON "BillingWebhookEvent"("invoiceId", "createdAt");
