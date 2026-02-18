-- Add marketSignal field to PortfolioStock and PurchaseRecommendation tables
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "marketSignal" TEXT;
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "marketSignal" TEXT;
