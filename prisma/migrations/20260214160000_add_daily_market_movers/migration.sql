-- AlterTable: Stock に dailyChangeRate カラムを追加
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "dailyChangeRate" DECIMAL(8,2);

-- CreateTable: DailyMarketMover（日次上昇/下落ランキング）
CREATE TABLE IF NOT EXISTS "DailyMarketMover" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "stockId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "changeRate" DECIMAL(8,2) NOT NULL,
    "analysis" TEXT NOT NULL,
    "relatedNews" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyMarketMover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DailyMarketMover_date_type_position_key" ON "DailyMarketMover"("date", "type", "position");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DailyMarketMover_date_idx" ON "DailyMarketMover"("date" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DailyMarketMover_stockId_idx" ON "DailyMarketMover"("stockId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DailyMarketMover_date_type_idx" ON "DailyMarketMover"("date", "type");

-- AddForeignKey
ALTER TABLE "DailyMarketMover" ADD CONSTRAINT "DailyMarketMover_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
