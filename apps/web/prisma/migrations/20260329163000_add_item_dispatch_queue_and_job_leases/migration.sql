ALTER TABLE "Job" ADD COLUMN "leaseId" TEXT;
ALTER TABLE "Job" ADD COLUMN "leaseOwner" TEXT;
ALTER TABLE "Job" ADD COLUMN "leaseExpiresAt" TIMESTAMP;
ALTER TABLE "Job" ADD COLUMN "lastHeartbeatAt" TIMESTAMP;
ALTER TABLE "Job" ADD COLUMN "dispatchMessageId" TEXT;

CREATE TABLE "DispatchQueueMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "jobId" TEXT NOT NULL,
  "jobKind" TEXT NOT NULL,
  "visibleAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dequeueCount" INTEGER NOT NULL DEFAULT 0,
  "reservationToken" TEXT,
  "reservedBy" TEXT,
  "reservedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DispatchQueueMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DispatchQueueMessage_jobId_key" ON "DispatchQueueMessage"("jobId");
CREATE INDEX "Job_status_leaseExpiresAt_idx" ON "Job"("status", "leaseExpiresAt");
CREATE INDEX "DispatchQueueMessage_visibleAt_createdAt_idx" ON "DispatchQueueMessage"("visibleAt", "createdAt");
