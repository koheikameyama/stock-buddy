-- CreateTable
CREATE TABLE IF NOT EXISTS "WeeklyAIReport" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "dailyRecommendationCount" INTEGER,
    "dailyRecommendationAvgReturn" DECIMAL(8,2),
    "dailyRecommendationPlusRate" DECIMAL(5,2),
    "dailyRecommendationSuccessRate" DECIMAL(5,2),
    "dailyRecommendationImprovement" TEXT,
    "purchaseRecommendationCount" INTEGER,
    "purchaseRecommendationAvgReturn" DECIMAL(8,2),
    "purchaseRecommendationPlusRate" DECIMAL(5,2),
    "purchaseRecommendationSuccessRate" DECIMAL(5,2),
    "purchaseRecommendationImprovement" TEXT,
    "stockAnalysisCount" INTEGER,
    "stockAnalysisAvgReturn" DECIMAL(8,2),
    "stockAnalysisPlusRate" DECIMAL(5,2),
    "stockAnalysisSuccessRate" DECIMAL(5,2),
    "stockAnalysisImprovement" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyAIReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyAIReport_weekStart_key" ON "WeeklyAIReport"("weekStart");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WeeklyAIReport_weekStart_idx" ON "WeeklyAIReport"("weekStart");
