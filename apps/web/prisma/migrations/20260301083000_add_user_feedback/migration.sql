CREATE TABLE "UserFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "feedbackType" TEXT,
    "featureArea" TEXT,
    "allowEmailContact" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "sourcePath" TEXT,
    "mirrorStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "mirrorIssueNumber" INTEGER,
    "mirrorIssueUrl" TEXT,
    "mirrorAttemptedAt" DATETIME,
    "mirrorErrorCode" TEXT,
    "mirrorErrorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserFeedback_status_createdAt_idx" ON "UserFeedback"("status", "createdAt");
CREATE INDEX "UserFeedback_userId_createdAt_idx" ON "UserFeedback"("userId", "createdAt");
CREATE INDEX "UserFeedback_mirrorStatus_createdAt_idx" ON "UserFeedback"("mirrorStatus", "createdAt");
