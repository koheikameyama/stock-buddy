-- CreateTable
CREATE TABLE IF NOT EXISTS "RecommendationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "budget" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "riskTolerance" TEXT NOT NULL,
    "targetStockCount" INTEGER NOT NULL,
    "candidateStocks" INTEGER NOT NULL,
    "affordableStocks" INTEGER NOT NULL,
    "selectedStocks" INTEGER NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "budgetUsageRate" DECIMAL(5,2) NOT NULL,
    "stocks" JSONB NOT NULL,
    "prompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationLog_pkey" PRIMARY KEY ("id")
);

-- Add prompt column if table already exists
ALTER TABLE "RecommendationLog" ADD COLUMN IF NOT EXISTS "prompt" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecommendationLog_userId_idx" ON "RecommendationLog"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecommendationLog_createdAt_idx" ON "RecommendationLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecommendationLog_budget_idx" ON "RecommendationLog"("budget");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecommendationLog_period_idx" ON "RecommendationLog"("period");

-- AddForeignKey
ALTER TABLE "RecommendationLog" ADD CONSTRAINT "RecommendationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
