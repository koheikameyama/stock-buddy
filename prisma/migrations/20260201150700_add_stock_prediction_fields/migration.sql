-- Drop existing StockAnalysis table (old structure)
DROP TABLE IF EXISTS "StockAnalysis" CASCADE;

-- Create new StockAnalysis table with prediction fields
CREATE TABLE "StockAnalysis" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "shortTermTrend" TEXT NOT NULL,
    "shortTermPriceLow" DECIMAL(12,2) NOT NULL,
    "shortTermPriceHigh" DECIMAL(12,2) NOT NULL,
    "midTermTrend" TEXT NOT NULL,
    "midTermPriceLow" DECIMAL(12,2) NOT NULL,
    "midTermPriceHigh" DECIMAL(12,2) NOT NULL,
    "longTermTrend" TEXT NOT NULL,
    "longTermPriceLow" DECIMAL(12,2) NOT NULL,
    "longTermPriceHigh" DECIMAL(12,2) NOT NULL,
    "recommendation" TEXT NOT NULL,
    "advice" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockAnalysis_stockId_analyzedAt_key" ON "StockAnalysis"("stockId", "analyzedAt");

-- CreateIndex
CREATE INDEX "StockAnalysis_stockId_analyzedAt_idx" ON "StockAnalysis"("stockId", "analyzedAt" DESC);

-- CreateIndex
CREATE INDEX "StockAnalysis_analyzedAt_idx" ON "StockAnalysis"("analyzedAt" DESC);

-- AddForeignKey
ALTER TABLE "StockAnalysis" ADD CONSTRAINT "StockAnalysis_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
