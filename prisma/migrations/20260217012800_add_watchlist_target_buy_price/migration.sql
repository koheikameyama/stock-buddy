-- AlterTable
ALTER TABLE "WatchlistStock" ADD COLUMN IF NOT EXISTS "targetBuyPrice" DECIMAL(12,2);
