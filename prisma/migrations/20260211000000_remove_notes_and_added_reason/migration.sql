-- AlterTable: Remove addedReason and note from WatchlistStock
ALTER TABLE "WatchlistStock" DROP COLUMN IF EXISTS "addedReason";
ALTER TABLE "WatchlistStock" DROP COLUMN IF EXISTS "note";

-- AlterTable: Remove note from PortfolioStock
ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "note";
