-- AlterTable: Add limit price and stop loss price to StockAnalysis
ALTER TABLE "StockAnalysis" ADD COLUMN IF NOT EXISTS "limitPrice" DECIMAL(12, 2);
ALTER TABLE "StockAnalysis" ADD COLUMN IF NOT EXISTS "stopLossPrice" DECIMAL(12, 2);
