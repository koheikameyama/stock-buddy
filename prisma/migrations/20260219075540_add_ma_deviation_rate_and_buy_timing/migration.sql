-- AlterTable: Stock - 移動平均乖離率カラム追加
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "maDeviationRate" DECIMAL(8, 2);

-- AlterTable: PurchaseRecommendation - 購入タイミングカラム追加
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "buyTiming" TEXT;
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "dipTargetPrice" DECIMAL(12, 2);
