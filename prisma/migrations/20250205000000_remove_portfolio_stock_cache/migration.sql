-- Remove cached columns from PortfolioStock
-- quantity and averagePurchasePrice are now calculated from Transaction

ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "quantity";
ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "averagePurchasePrice";
ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "purchaseDate";
