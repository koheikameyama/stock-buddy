-- CreateTable
CREATE TABLE IF NOT EXISTS "PortfolioOverallAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL,
    "sectorConcentration" DECIMAL(5,2),
    "sectorCount" INTEGER,
    "totalValue" DECIMAL(15,2),
    "totalCost" DECIMAL(15,2),
    "unrealizedGain" DECIMAL(15,2),
    "unrealizedGainPercent" DECIMAL(8,2),
    "portfolioVolatility" DECIMAL(8,2),
    "overallSummary" TEXT NOT NULL,
    "overallStatus" TEXT NOT NULL,
    "overallStatusType" TEXT NOT NULL,
    "metricsAnalysis" JSONB NOT NULL,
    "actionSuggestions" JSONB NOT NULL,
    "watchlistSimulation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioOverallAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PortfolioOverallAnalysis_userId_key" ON "PortfolioOverallAnalysis"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PortfolioOverallAnalysis_userId_idx" ON "PortfolioOverallAnalysis"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PortfolioOverallAnalysis_analyzedAt_idx" ON "PortfolioOverallAnalysis"("analyzedAt" DESC);

-- AddForeignKey
ALTER TABLE "PortfolioOverallAnalysis" ADD CONSTRAINT "PortfolioOverallAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
