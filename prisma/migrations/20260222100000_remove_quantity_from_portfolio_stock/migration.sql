-- AlterTable: Remove quantity column from PortfolioStock
-- quantity is now always calculated from Transaction records
ALTER TABLE "PortfolioStock" DROP COLUMN "quantity";
