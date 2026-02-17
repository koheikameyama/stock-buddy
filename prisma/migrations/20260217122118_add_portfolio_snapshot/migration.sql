-- CreateTable
CREATE TABLE IF NOT EXISTS "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalValue" DECIMAL(15,2) NOT NULL,
    "totalCost" DECIMAL(15,2) NOT NULL,
    "unrealizedGain" DECIMAL(15,2) NOT NULL,
    "unrealizedGainPercent" DECIMAL(8,2) NOT NULL,
    "stockCount" INTEGER NOT NULL,
    "sectorBreakdown" JSONB,
    "stockBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PortfolioSnapshot_userId_date_key" ON "PortfolioSnapshot"("userId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PortfolioSnapshot_userId_date_idx" ON "PortfolioSnapshot"("userId", "date" DESC);

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PortfolioSnapshot_userId_fkey'
    ) THEN
        ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
