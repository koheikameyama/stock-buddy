-- CreateTable
CREATE TABLE IF NOT EXISTS "SectorTrend" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sector" TEXT NOT NULL,
    "score3d" DOUBLE PRECISION NOT NULL,
    "newsCount3d" INTEGER NOT NULL,
    "positive3d" INTEGER NOT NULL,
    "negative3d" INTEGER NOT NULL,
    "neutral3d" INTEGER NOT NULL,
    "score7d" DOUBLE PRECISION NOT NULL,
    "newsCount7d" INTEGER NOT NULL,
    "positive7d" INTEGER NOT NULL,
    "negative7d" INTEGER NOT NULL,
    "neutral7d" INTEGER NOT NULL,
    "usNewsCount3d" INTEGER NOT NULL DEFAULT 0,
    "usNewsCount7d" INTEGER NOT NULL DEFAULT 0,
    "avgWeekChangeRate" DOUBLE PRECISION,
    "avgDailyChangeRate" DOUBLE PRECISION,
    "avgMaDeviationRate" DOUBLE PRECISION,
    "avgVolumeRatio" DOUBLE PRECISION,
    "avgVolatility" DOUBLE PRECISION,
    "stockCount" INTEGER NOT NULL DEFAULT 0,
    "compositeScore" DOUBLE PRECISION,
    "trendDirection" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectorTrend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SectorTrend_date_sector_key" ON "SectorTrend"("date", "sector");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SectorTrend_date_idx" ON "SectorTrend"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SectorTrend_sector_idx" ON "SectorTrend"("sector");
