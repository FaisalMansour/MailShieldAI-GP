ALTER TABLE "GmailConnection"
  ADD COLUMN "grantedScopes" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "monitoringEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "watchExpiresAt" TIMESTAMP(3),
  ADD COLUMN "watchRenewedAt" TIMESTAMP(3),
  ADD COLUMN "lastNotificationAt" TIMESTAMP(3),
  ADD COLUMN "lastAutomaticSyncAt" TIMESTAMP(3),
  ADD COLUMN "lastAnalysisAt" TIMESTAMP(3),
  ADD COLUMN "lastLabelAt" TIMESTAMP(3),
  ADD COLUMN "monitoringError" TEXT,
  ADD COLUMN "mediumLabelId" TEXT,
  ADD COLUMN "highLabelId" TEXT,
  ADD COLUMN "watchLockUntil" TIMESTAMP(3),
  ADD COLUMN "retryAfter" TIMESTAMP(3),
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GmailConnection" ADD COLUMN "syncLockUntil" TIMESTAMP(3);

ALTER TABLE "StoredEmail"
  ADD COLUMN "gmailLabelStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "gmailLabelId" TEXT,
  ADD COLUMN "gmailLabelError" TEXT,
  ADD COLUMN "gmailLabelAt" TIMESTAMP(3),
  ADD COLUMN "gmailLabelRetries" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "gmailLabelLockUntil" TIMESTAMP(3);
ALTER TABLE "StoredEmail"
  ADD COLUMN "automaticAnalysisRetries" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "automaticAnalysisNextAt" TIMESTAMP(3);
UPDATE "GmailConnection" SET "grantedScopes" = 'https://www.googleapis.com/auth/gmail.readonly'
  WHERE "status" = 'CONNECTED' AND "grantedScopes" = '';

CREATE TABLE "GmailPushNotification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "connectionId" TEXT NOT NULL,
  "pubsubId" TEXT NOT NULL,
  "historyId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "GmailPushNotification_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GmailConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GmailPushNotification_pubsubId_key" ON "GmailPushNotification"("pubsubId");
CREATE INDEX "GmailPushNotification_connectionId_receivedAt_idx" ON "GmailPushNotification"("connectionId", "receivedAt");

CREATE TABLE "GmailSyncRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "connectionId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "imported" INTEGER NOT NULL DEFAULT 0,
  "duplicate" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "errorCode" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "GmailSyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GmailConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "GmailSyncRun_connectionId_startedAt_idx" ON "GmailSyncRun"("connectionId", "startedAt");
