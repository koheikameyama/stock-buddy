-- Remove manual price setting fields (user-defined targets)
-- AI-generated suggestedSellPrice and sellCondition are kept

-- AlterTable: Remove alertPrice from WatchlistStock
ALTER TABLE "WatchlistStock" DROP COLUMN IF EXISTS "alertPrice";

-- AlterTable: Remove targetPrice and stopLossPrice from PortfolioStock
ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "targetPrice";
ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "stopLossPrice";
