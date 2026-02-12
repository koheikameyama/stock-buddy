-- AddColumns: Latest price data for batch updates
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "latestPrice" DECIMAL(12, 2);
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "latestVolume" BIGINT;
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "weekChangeRate" DECIMAL(8, 2);
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "priceUpdatedAt" TIMESTAMP(3);
