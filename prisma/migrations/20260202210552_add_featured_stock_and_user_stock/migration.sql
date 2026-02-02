-- AlterTable
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "listedDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FeaturedStock" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT NOT NULL,
    "reason" TEXT,
    "score" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeaturedStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserStock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "quantity" INTEGER,
    "averagePrice" DOUBLE PRECISION,
    "purchaseDate" TIMESTAMP(3),
    "lastAnalysis" TIMESTAMP(3),
    "shortTerm" TEXT,
    "mediumTerm" TEXT,
    "longTerm" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeaturedStock_date_idx" ON "FeaturedStock"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeaturedStock_category_idx" ON "FeaturedStock"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeaturedStock_stockId_idx" ON "FeaturedStock"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserStock_userId_stockId_key" ON "UserStock"("userId", "stockId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserStock_userId_idx" ON "UserStock"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserStock_stockId_idx" ON "UserStock"("stockId");

-- AddForeignKey (only if not exists)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FeaturedStock_stockId_fkey'
    ) THEN
        ALTER TABLE "FeaturedStock" ADD CONSTRAINT "FeaturedStock_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey (only if not exists)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserStock_userId_fkey'
    ) THEN
        ALTER TABLE "UserStock" ADD CONSTRAINT "UserStock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey (only if not exists)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserStock_stockId_fkey'
    ) THEN
        ALTER TABLE "UserStock" ADD CONSTRAINT "UserStock_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
