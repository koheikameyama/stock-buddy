-- AlterTable: Remove purchase recommendation fields
ALTER TABLE "PurchaseRecommendation" DROP COLUMN IF EXISTS "recommendedQuantity";
ALTER TABLE "PurchaseRecommendation" DROP COLUMN IF EXISTS "recommendedPrice";
ALTER TABLE "PurchaseRecommendation" DROP COLUMN IF EXISTS "estimatedAmount";
