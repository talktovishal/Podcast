-- CreateTable
CREATE TABLE "BillingWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "userId" TEXT,
    "customerId" TEXT,
    "subscriptionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "errorMessage" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingWebhookEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "complimentaryPro" BOOLEAN NOT NULL DEFAULT false,
    "billingProvider" TEXT,
    "billingCustomerId" TEXT,
    "billingSubscriptionId" TEXT,
    "billingPlanCode" TEXT NOT NULL DEFAULT 'STARTER',
    "billingStatus" TEXT NOT NULL DEFAULT 'NONE',
    "billingCurrentPeriodEnd" DATETIME,
    "billingCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "billingUpdatedAt" DATETIME,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "extraSubmissionCredits" INTEGER NOT NULL DEFAULT 0,
    "ttsProvider" TEXT NOT NULL DEFAULT 'kokoro',
    "ttsVoice" TEXT NOT NULL DEFAULT 'af_heart',
    "firstSeenAt" DATETIME,
    "firstSeenCountryCode" TEXT,
    "firstSeenRegionCode" TEXT,
    "firstSeenCity" TEXT,
    "lastSeenAt" DATETIME,
    "lastSeenCountryCode" TEXT,
    "lastSeenRegionCode" TEXT,
    "lastSeenCity" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "extraSubmissionCredits", "firstSeenAt", "firstSeenCity", "firstSeenCountryCode", "firstSeenRegionCode", "id", "isPaid", "lastSeenAt", "lastSeenCity", "lastSeenCountryCode", "lastSeenRegionCode", "name", "passwordHash", "role", "submissionCount", "ttsProvider", "ttsVoice", "updatedAt") SELECT "createdAt", "email", "extraSubmissionCredits", "firstSeenAt", "firstSeenCity", "firstSeenCountryCode", "firstSeenRegionCode", "id", "isPaid", "lastSeenAt", "lastSeenCity", "lastSeenCountryCode", "lastSeenRegionCode", "name", "passwordHash", "role", "submissionCount", "ttsProvider", "ttsVoice", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_billingCustomerId_key" ON "User"("billingCustomerId");
CREATE UNIQUE INDEX "User_billingSubscriptionId_key" ON "User"("billingSubscriptionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BillingWebhookEvent_userId_createdAt_idx" ON "BillingWebhookEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingWebhookEvent_provider_createdAt_idx" ON "BillingWebhookEvent"("provider", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingWebhookEvent_provider_providerEventId_key" ON "BillingWebhookEvent"("provider", "providerEventId");
