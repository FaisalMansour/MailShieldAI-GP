ALTER TABLE "User"
ALTER COLUMN "dailyAnalysisLimit" SET DEFAULT 50;

UPDATE "User"
SET "dailyAnalysisLimit" = 50
WHERE "dailyAnalysisLimit" = 10;
