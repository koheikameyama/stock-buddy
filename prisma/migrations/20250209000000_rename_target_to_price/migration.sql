-- AlterTable: Rename percentage-based columns to price-based columns
-- Note: Existing percentage values cannot be converted to prices without knowing the average purchase price,
-- so existing values will be lost. Users need to re-set their targets.

-- Drop old columns
ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "targetReturnRate";
ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "stopLossRate";

-- Add new columns
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "targetPrice" DECIMAL(12,2);
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "stopLossPrice" DECIMAL(12,2);
