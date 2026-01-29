-- CreateTable
CREATE TABLE IF NOT EXISTS "DailyFeaturedStock" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "stockId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyFeaturedStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DailyFeaturedStock_date_idx" ON "DailyFeaturedStock"("date" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DailyFeaturedStock_stockId_idx" ON "DailyFeaturedStock"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DailyFeaturedStock_date_position_key" ON "DailyFeaturedStock"("date", "position");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DailyFeaturedStock_stockId_fkey'
    ) THEN
        ALTER TABLE "DailyFeaturedStock" ADD CONSTRAINT "DailyFeaturedStock_stockId_fkey"
        FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
