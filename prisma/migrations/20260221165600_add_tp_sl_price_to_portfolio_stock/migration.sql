-- AlterTable: PortfolioStockにTP/SL価格フィールドを追加
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "takeProfitPrice" DECIMAL(12,2),
                              ADD COLUMN IF NOT EXISTS "stopLossPrice" DECIMAL(12,2);
