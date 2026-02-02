-- Drop old Portfolio, Watchlist, and related models

-- Drop PortfolioStockAnalysis table
DROP TABLE IF EXISTS "PortfolioStockAnalysis" CASCADE;

-- Drop DailyReport table
DROP TABLE IF EXISTS "DailyReport" CASCADE;

-- Drop Transaction table
DROP TABLE IF EXISTS "Transaction" CASCADE;

-- Drop PortfolioStock table
DROP TABLE IF EXISTS "PortfolioStock" CASCADE;

-- Drop PortfolioSnapshot table
DROP TABLE IF EXISTS "PortfolioSnapshot" CASCADE;

-- Drop Watchlist table
DROP TABLE IF EXISTS "Watchlist" CASCADE;

-- Drop Portfolio table
DROP TABLE IF EXISTS "Portfolio" CASCADE;

-- Update UserStock model - rename averagePrice to averagePurchasePrice and add note
ALTER TABLE "UserStock" RENAME COLUMN "averagePrice" TO "averagePurchasePrice";
ALTER TABLE "UserStock" ALTER COLUMN "averagePurchasePrice" TYPE DECIMAL(12,2);
ALTER TABLE "UserStock" ADD COLUMN IF NOT EXISTS "note" TEXT;
