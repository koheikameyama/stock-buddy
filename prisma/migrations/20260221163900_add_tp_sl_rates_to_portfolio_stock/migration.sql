-- AlterTable: PortfolioStockにTP/SLレートフィールドを追加
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "takeProfitRate" DECIMAL(65,30),
                              ADD COLUMN IF NOT EXISTS "stopLossRate"   DECIMAL(65,30);
