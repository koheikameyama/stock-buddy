-- AddColumns: Volatility and volume ratio for featured stocks calculation
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "volatility" DECIMAL(8, 2);
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "volumeRatio" DECIMAL(8, 2);
