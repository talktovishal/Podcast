ALTER TABLE "User" ADD COLUMN "defaultItemProcessingMode" TEXT NOT NULL DEFAULT 'FULL_EPISODE';

ALTER TABLE "Item" ADD COLUMN "processingMode" TEXT NOT NULL DEFAULT 'FULL_EPISODE';
ALTER TABLE "Item" ADD COLUMN "summaryStatus" TEXT NOT NULL DEFAULT 'NOT_REQUESTED';
ALTER TABLE "Item" ADD COLUMN "summaryTitle" TEXT;
ALTER TABLE "Item" ADD COLUMN "summaryStorageKey" TEXT;
ALTER TABLE "Item" ADD COLUMN "summaryBytes" INTEGER;
ALTER TABLE "Item" ADD COLUMN "summaryProvider" TEXT;
ALTER TABLE "Item" ADD COLUMN "summaryModel" TEXT;
ALTER TABLE "Item" ADD COLUMN "summaryDeployment" TEXT;
ALTER TABLE "Item" ADD COLUMN "summaryInputTokens" INTEGER;
ALTER TABLE "Item" ADD COLUMN "summaryOutputTokens" INTEGER;
ALTER TABLE "Item" ADD COLUMN "summaryErrorCode" TEXT;
ALTER TABLE "Item" ADD COLUMN "summaryErrorMessage" TEXT;
ALTER TABLE "Item" ADD COLUMN "summaryCompletedAt" DATETIME;

ALTER TABLE "Job" ADD COLUMN "jobKind" TEXT NOT NULL DEFAULT 'FULL_EPISODE';

CREATE INDEX "Item_userId_processingMode_idx" ON "Item"("userId", "processingMode");
CREATE INDEX "Item_userId_summaryStatus_idx" ON "Item"("userId", "summaryStatus");
CREATE INDEX "Job_jobKind_status_idx" ON "Job"("jobKind", "status");
