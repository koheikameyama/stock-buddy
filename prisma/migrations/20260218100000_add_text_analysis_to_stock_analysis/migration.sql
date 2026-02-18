-- AlterTable
ALTER TABLE "StockAnalysis" ADD COLUMN IF NOT EXISTS "shortTermText" TEXT;
ALTER TABLE "StockAnalysis" ADD COLUMN IF NOT EXISTS "midTermText" TEXT;
ALTER TABLE "StockAnalysis" ADD COLUMN IF NOT EXISTS "longTermText" TEXT;
ALTER TABLE "StockAnalysis" ADD COLUMN IF NOT EXISTS "simpleStatus" TEXT;
ALTER TABLE "StockAnalysis" ADD COLUMN IF NOT EXISTS "statusType" TEXT;
ALTER TABLE "StockAnalysis" ADD COLUMN IF NOT EXISTS "sellCondition" TEXT;
