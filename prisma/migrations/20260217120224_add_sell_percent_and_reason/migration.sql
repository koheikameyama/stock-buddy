-- AlterTable
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "suggestedSellPercent" INTEGER;
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "sellReason" TEXT;
