CREATE TABLE "ArticleSummaryTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" DATETIME,
    "nextRetryAt" DATETIME,
    "lockedAt" DATETIME,
    "leaseId" TEXT,
    "leaseOwner" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArticleSummaryTask_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ArticleSummaryTask_itemId_key" ON "ArticleSummaryTask"("itemId");
CREATE INDEX "ArticleSummaryTask_status_scheduledFor_idx" ON "ArticleSummaryTask"("status", "scheduledFor");
CREATE INDEX "ArticleSummaryTask_status_nextRetryAt_idx" ON "ArticleSummaryTask"("status", "nextRetryAt");
CREATE INDEX "ArticleSummaryTask_userId_createdAt_idx" ON "ArticleSummaryTask"("userId", "createdAt");
