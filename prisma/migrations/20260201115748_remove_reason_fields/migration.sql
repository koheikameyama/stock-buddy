-- AlterTable: reasonカラムを削除
ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "reason";
ALTER TABLE "Watchlist" DROP COLUMN IF EXISTS "reason";
