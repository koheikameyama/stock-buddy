-- CreateTable
CREATE TABLE IF NOT EXISTS "RecommendationOutcome" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "tickerCode" TEXT NOT NULL,
    "sector" TEXT,
    "recommendedAt" TIMESTAMP(3) NOT NULL,
    "priceAtRec" DECIMAL(12,2) NOT NULL,
    "prediction" TEXT NOT NULL,
    "confidence" DECIMAL(5,2),
    "volatility" DECIMAL(8,2),
    "marketCap" BIGINT,
    "returnAfter1Day" DECIMAL(8,2),
    "returnAfter3Days" DECIMAL(8,2),
    "returnAfter7Days" DECIMAL(8,2),
    "returnAfter14Days" DECIMAL(8,2),
    "benchmarkReturn7Days" DECIMAL(8,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RecommendationOutcome_type_recommendationId_key" ON "RecommendationOutcome"("type", "recommendationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecommendationOutcome_type_recommendedAt_idx" ON "RecommendationOutcome"("type", "recommendedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecommendationOutcome_sector_idx" ON "RecommendationOutcome"("sector");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecommendationOutcome_tickerCode_idx" ON "RecommendationOutcome"("tickerCode");

-- AddForeignKey
ALTER TABLE "RecommendationOutcome" ADD CONSTRAINT "RecommendationOutcome_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
