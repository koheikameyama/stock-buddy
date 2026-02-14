-- AlterTable: MarketNewsにmarket/regionカラムを追加
ALTER TABLE "MarketNews" ADD COLUMN IF NOT EXISTS "market" TEXT NOT NULL DEFAULT 'JP';
ALTER TABLE "MarketNews" ADD COLUMN IF NOT EXISTS "region" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketNews_market_idx" ON "MarketNews"("market");
