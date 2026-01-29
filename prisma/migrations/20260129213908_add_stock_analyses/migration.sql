-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "portfolioStockAnalyses" TEXT[];

-- CreateTable
CREATE TABLE IF NOT EXISTS "StockAnalysis" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "currentPrice" DECIMAL(12,2) NOT NULL,
    "priceChange" DECIMAL(12,2) NOT NULL,
    "priceChangePct" DECIMAL(5,2) NOT NULL,
    "trend" TEXT NOT NULL,
    "buyTiming" TEXT NOT NULL,
    "analysis" TEXT NOT NULL,
    "keyPoints" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PortfolioStockAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioStockId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "currentPrice" DECIMAL(12,2) NOT NULL,
    "currentValue" DECIMAL(15,2) NOT NULL,
    "gainLoss" DECIMAL(15,2) NOT NULL,
    "gainLossPct" DECIMAL(5,2) NOT NULL,
    "action" TEXT NOT NULL,
    "analysis" TEXT NOT NULL,
    "reasoning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioStockAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StockAnalysis_stockId_date_key" ON "StockAnalysis"("stockId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockAnalysis_stockId_date_idx" ON "StockAnalysis"("stockId", "date" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockAnalysis_date_idx" ON "StockAnalysis"("date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PortfolioStockAnalysis_portfolioStockId_date_key" ON "PortfolioStockAnalysis"("portfolioStockId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PortfolioStockAnalysis_userId_date_idx" ON "PortfolioStockAnalysis"("userId", "date" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PortfolioStockAnalysis_portfolioStockId_date_idx" ON "PortfolioStockAnalysis"("portfolioStockId", "date" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PortfolioStockAnalysis_date_idx" ON "PortfolioStockAnalysis"("date" DESC);

-- AddForeignKey (drop if exists first)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'StockAnalysis_stockId_fkey'
    ) THEN
        ALTER TABLE "StockAnalysis" ADD CONSTRAINT "StockAnalysis_stockId_fkey"
        FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PortfolioStockAnalysis_userId_fkey'
    ) THEN
        ALTER TABLE "PortfolioStockAnalysis" ADD CONSTRAINT "PortfolioStockAnalysis_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PortfolioStockAnalysis_portfolioStockId_fkey'
    ) THEN
        ALTER TABLE "PortfolioStockAnalysis" ADD CONSTRAINT "PortfolioStockAnalysis_portfolioStockId_fkey"
        FOREIGN KEY ("portfolioStockId") REFERENCES "PortfolioStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
