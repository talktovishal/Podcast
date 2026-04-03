ALTER TABLE "User" ADD COLUMN "billingLanePreference" TEXT NOT NULL DEFAULT 'LIVE';

CREATE TABLE "SandboxBillingAccount" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "billingProvider" TEXT,
    "billingCustomerId" TEXT,
    "billingSubscriptionId" TEXT,
    "billingPriceId" TEXT,
    "billingPlanCode" TEXT NOT NULL DEFAULT 'STARTER',
    "billingStatus" TEXT NOT NULL DEFAULT 'NONE',
    "billingEntitlementStatus" TEXT NOT NULL DEFAULT 'INACTIVE',
    "billingLastPaymentStatus" TEXT NOT NULL DEFAULT 'NONE',
    "billingLastInvoiceId" TEXT,
    "billingCurrentPeriodEnd" DATETIME,
    "billingCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "billingLastStripeEventId" TEXT,
    "billingLastStripeEventCreatedAt" DATETIME,
    "billingLastSubscriptionEventAt" DATETIME,
    "billingLastInvoiceEventAt" DATETIME,
    "billingUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SandboxBillingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SandboxBillingAccount_billingCustomerId_key" ON "SandboxBillingAccount"("billingCustomerId");
CREATE UNIQUE INDEX "SandboxBillingAccount_billingSubscriptionId_key" ON "SandboxBillingAccount"("billingSubscriptionId");
