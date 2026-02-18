-- PortfolioStock: 売りタイミング判断
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "sellTiming" TEXT;
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "sellTargetPrice" DECIMAL(12, 2);

-- PurchaseRecommendation: 売りタイミング判断（avoid時）
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "sellTiming" TEXT;
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "sellTargetPrice" DECIMAL(10, 2);
