-- AlterTable
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "isSimulation" BOOLEAN NOT NULL DEFAULT true;
