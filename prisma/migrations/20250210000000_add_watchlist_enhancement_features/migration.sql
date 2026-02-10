-- AlterTable: PurchaseRecommendation に新しいカラムを追加
-- A. 買い時判断
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "shouldBuyToday" BOOLEAN;
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "idealEntryPrice" DECIMAL(12, 2);
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "priceGap" DECIMAL(12, 2);
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "buyTimingExplanation" TEXT;

-- B. 深掘り評価
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "positives" TEXT;
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "concerns" TEXT;
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "suitableFor" TEXT;

-- D. パーソナライズ
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "userFitScore" INTEGER;
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "budgetFit" BOOLEAN;
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "periodFit" BOOLEAN;
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "riskFit" BOOLEAN;
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "personalizedReason" TEXT;

-- CreateTable: C. 見送った銘柄の追跡
CREATE TABLE IF NOT EXISTS "PassedStockTracking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "passedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passedPrice" DECIMAL(12,2) NOT NULL,
    "passedReason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'watchlist',
    "currentPrice" DECIMAL(12,2),
    "priceChangePercent" DECIMAL(6,2),
    "whatIfProfit" DECIMAL(15,2),
    "whatIfQuantity" INTEGER,
    "wasGoodDecision" BOOLEAN,
    "feedbackNote" TEXT,
    "lastTrackedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PassedStockTracking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PassedStockTracking_userId_idx" ON "PassedStockTracking"("userId");
CREATE INDEX IF NOT EXISTS "PassedStockTracking_stockId_idx" ON "PassedStockTracking"("stockId");
CREATE INDEX IF NOT EXISTS "PassedStockTracking_passedAt_idx" ON "PassedStockTracking"("passedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "PassedStockTracking_userId_stockId_passedAt_key" ON "PassedStockTracking"("userId", "stockId", "passedAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PassedStockTracking_userId_fkey'
    ) THEN
        ALTER TABLE "PassedStockTracking" ADD CONSTRAINT "PassedStockTracking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PassedStockTracking_stockId_fkey'
    ) THEN
        ALTER TABLE "PassedStockTracking" ADD CONSTRAINT "PassedStockTracking_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
