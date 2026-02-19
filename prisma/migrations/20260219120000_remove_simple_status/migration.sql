-- AlterTable: StockAnalysis
ALTER TABLE "StockAnalysis" DROP COLUMN IF EXISTS "simpleStatus";

-- AlterTable: PortfolioStock
ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "simpleStatus";
