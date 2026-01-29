-- AlterTable
ALTER TABLE "Watchlist"
ADD COLUMN IF NOT EXISTS "targetPrice" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "priceAlert" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "lastAlertSent" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "buyTimingScore" INTEGER,
ADD COLUMN IF NOT EXISTS "lastAnalyzedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "virtualBuyPrice" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "virtualBuyDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "virtualQuantity" INTEGER,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Watchlist_userId_priceAlert_idx" ON "Watchlist"("userId", "priceAlert");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Watchlist_lastAnalyzedAt_idx" ON "Watchlist"("lastAnalyzedAt");
