-- AlterTable
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "emotionalCoaching" TEXT;
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "simpleStatus" TEXT;
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "statusType" TEXT;
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "suggestedSellPrice" DECIMAL(12,2);
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "sellCondition" TEXT;
