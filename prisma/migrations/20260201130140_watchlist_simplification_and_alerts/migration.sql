-- ウォッチリスト簡素化とアラート機能追加

-- Watchlistから不要なフィールドを削除
ALTER TABLE "Watchlist" DROP COLUMN IF EXISTS "recommendedPrice";
ALTER TABLE "Watchlist" DROP COLUMN IF EXISTS "recommendedQty";
ALTER TABLE "Watchlist" DROP COLUMN IF EXISTS "source";
ALTER TABLE "Watchlist" DROP COLUMN IF EXISTS "buyTimingScore";
ALTER TABLE "Watchlist" DROP COLUMN IF EXISTS "lastAnalyzedAt";
ALTER TABLE "Watchlist" DROP COLUMN IF EXISTS "virtualBuyPrice";
ALTER TABLE "Watchlist" DROP COLUMN IF EXISTS "virtualBuyDate";
ALTER TABLE "Watchlist" DROP COLUMN IF EXISTS "virtualQuantity";

-- Watchlistにアラート条件を追加
ALTER TABLE "Watchlist" ADD COLUMN IF NOT EXISTS "targetCondition" TEXT;

-- Watchlistの不要なインデックスを削除
DROP INDEX IF EXISTS "Watchlist_lastAnalyzedAt_idx";

-- PortfolioStockにアラート機能を追加
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "targetPrice" DECIMAL(12,2);
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "targetCondition" TEXT;
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "priceAlert" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "lastAlertSent" TIMESTAMP(3);

-- PortfolioStockにアラート用インデックスを追加
CREATE INDEX IF NOT EXISTS "PortfolioStock_portfolioId_priceAlert_idx" ON "PortfolioStock"("portfolioId", "priceAlert");

-- Userに課金プラン用フィールドを追加
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionPlan" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionExpiry" TIMESTAMP(3);
