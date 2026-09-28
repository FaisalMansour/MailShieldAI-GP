-- CreateEnum
CREATE TYPE "EmailSource" AS ENUM ('GMAIL', 'EML_UPLOAD');

-- CreateEnum
CREATE TYPE "AnalysisClassification" AS ENUM ('LEGITIMATE', 'SUSPICIOUS', 'PHISHING', 'IMPERSONATION', 'SCAM', 'MALWARE_RELATED', 'SPAM', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "AnalysisSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AnalysisConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('HEADER', 'SENDER', 'REPLY_TO', 'SUBJECT', 'BODY', 'URL', 'ATTACHMENT_METADATA', 'AUTHENTICATION_RESULT', 'DETERMINISTIC_CHECK');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmailProcessingStatus" ADD VALUE 'QUEUED';
ALTER TYPE "EmailProcessingStatus" ADD VALUE 'ANALYZING';
ALTER TYPE "EmailProcessingStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "EmailProcessingStatus" ADD VALUE 'FAILED';
ALTER TYPE "EmailProcessingStatus" ADD VALUE 'NEEDS_REVIEW';

-- AlterTable
ALTER TABLE "StoredEmail" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "source" "EmailSource" NOT NULL DEFAULT 'GMAIL',
ADD COLUMN     "uploadFileName" TEXT,
ADD COLUMN     "uploadedAt" TIMESTAMP(3),
ALTER COLUMN "gmailConnectionId" DROP NOT NULL,
ALTER COLUMN "gmailMessageId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "analysisEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dailyAnalysisLimit" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "AnalysisReport" (
    "id" TEXT NOT NULL,
    "storedEmailId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "classification" "AnalysisClassification" NOT NULL,
    "aiScore" INTEGER NOT NULL,
    "deterministicContribution" INTEGER NOT NULL,
    "finalScore" INTEGER NOT NULL,
    "severity" "AnalysisSeverity" NOT NULL,
    "confidence" "AnalysisConfidence" NOT NULL,
    "overview" TEXT NOT NULL,
    "interpretations" JSONB NOT NULL,
    "suspiciousLocations" JSONB NOT NULL,
    "attackMethod" TEXT NOT NULL,
    "recommendedActions" JSONB NOT NULL,
    "limitations" JSONB NOT NULL,
    "humanReviewRecommended" BOOLEAN NOT NULL DEFAULT false,
    "bodyTruncated" BOOLEAN NOT NULL DEFAULT false,
    "checkVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "modelIdentifier" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostMicros" INTEGER,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisEvidence" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "source" "EvidenceSource" NOT NULL,
    "label" TEXT NOT NULL,
    "exactValue" TEXT NOT NULL,
    "interpretation" TEXT,

    CONSTRAINT "AnalysisEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeterministicFinding" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "severity" "AnalysisSeverity" NOT NULL,
    "explanation" TEXT NOT NULL,
    "supportingValue" TEXT NOT NULL,
    "sourceField" TEXT NOT NULL,
    "checkVersion" TEXT NOT NULL,

    CONSTRAINT "DeterministicFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCorrection" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "markedNotThreat" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertedAt" TIMESTAMP(3),

    CONSTRAINT "UserCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storedEmailId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "severity" "AnalysisSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "usageDate" TIMESTAMP(3) NOT NULL,
    "analyzedMessages" INTEGER NOT NULL DEFAULT 1,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostMicros" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationDataset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationCase" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sender" TEXT,
    "replyTo" TEXT,
    "expectedClass" "AnalysisClassification" NOT NULL,
    "split" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "sanitization" TEXT NOT NULL,

    CONSTRAINT "EvaluationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationRun" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "userId" TEXT,
    "modelIdentifier" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "datasetVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metrics" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "EvaluationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "reportId" TEXT,
    "predictedClass" "AnalysisClassification",
    "finalScore" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "classificationReasonable" BOOLEAN,
    "evidenceSupported" BOOLEAN,
    "inventedClaims" BOOLEAN,
    "actionsAppropriate" BOOLEAN,
    "injectionIgnored" BOOLEAN,
    "reviewNotes" TEXT,

    CONSTRAINT "EvaluationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisReport_userId_analyzedAt_idx" ON "AnalysisReport"("userId", "analyzedAt");

-- CreateIndex
CREATE INDEX "AnalysisReport_storedEmailId_analyzedAt_idx" ON "AnalysisReport"("storedEmailId", "analyzedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisReport_storedEmailId_version_key" ON "AnalysisReport"("storedEmailId", "version");

-- CreateIndex
CREATE INDEX "AnalysisEvidence_reportId_idx" ON "AnalysisEvidence"("reportId");

-- CreateIndex
CREATE INDEX "DeterministicFinding_reportId_idx" ON "DeterministicFinding"("reportId");

-- CreateIndex
CREATE INDEX "UserCorrection_userId_createdAt_idx" ON "UserCorrection"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserCorrection_reportId_revertedAt_idx" ON "UserCorrection"("reportId", "revertedAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisUsage_reportId_key" ON "AnalysisUsage"("reportId");

-- CreateIndex
CREATE INDEX "AnalysisUsage_userId_usageDate_idx" ON "AnalysisUsage"("userId", "usageDate");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationDataset_name_version_key" ON "EvaluationDataset"("name", "version");

-- CreateIndex
CREATE INDEX "EvaluationCase_datasetId_split_idx" ON "EvaluationCase"("datasetId", "split");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationCase_datasetId_itemId_key" ON "EvaluationCase"("datasetId", "itemId");

-- CreateIndex
CREATE INDEX "EvaluationRun_datasetId_startedAt_idx" ON "EvaluationRun"("datasetId", "startedAt");

-- CreateIndex
CREATE INDEX "EvaluationResult_runId_idx" ON "EvaluationResult"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationResult_runId_caseId_key" ON "EvaluationResult"("runId", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "StoredEmail_userId_contentHash_key" ON "StoredEmail"("userId", "contentHash");

-- AddForeignKey
ALTER TABLE "AnalysisReport" ADD CONSTRAINT "AnalysisReport_storedEmailId_fkey" FOREIGN KEY ("storedEmailId") REFERENCES "StoredEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisReport" ADD CONSTRAINT "AnalysisReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisEvidence" ADD CONSTRAINT "AnalysisEvidence_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AnalysisReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeterministicFinding" ADD CONSTRAINT "DeterministicFinding_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AnalysisReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCorrection" ADD CONSTRAINT "UserCorrection_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AnalysisReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_storedEmailId_fkey" FOREIGN KEY ("storedEmailId") REFERENCES "StoredEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AnalysisReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisUsage" ADD CONSTRAINT "AnalysisUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisUsage" ADD CONSTRAINT "AnalysisUsage_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AnalysisReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCase" ADD CONSTRAINT "EvaluationCase_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "EvaluationDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRun" ADD CONSTRAINT "EvaluationRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "EvaluationDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRun" ADD CONSTRAINT "EvaluationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResult" ADD CONSTRAINT "EvaluationResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EvaluationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResult" ADD CONSTRAINT "EvaluationResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "EvaluationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResult" ADD CONSTRAINT "EvaluationResult_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AnalysisReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;


