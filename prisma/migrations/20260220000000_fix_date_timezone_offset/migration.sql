-- @db.Date カラムの日付がJSTから1日ズレていたのを修正
-- getTodayForDB() が JST→UTC変換時にdate型で1日前になっていた問題の既存データ補正
-- ユニーク制約(INDEX)の衝突を避けるため、一時的に削除して一括更新後に再作成

-- SectorTrend (unique: date, sector)
DROP INDEX IF EXISTS "SectorTrend_date_sector_key";
UPDATE "SectorTrend" SET date = date + INTERVAL '1 day';
CREATE UNIQUE INDEX "SectorTrend_date_sector_key" ON "SectorTrend"("date", "sector");

-- DailyFeaturedStock (unique: date, position)
DROP INDEX IF EXISTS "DailyFeaturedStock_date_position_key";
UPDATE "DailyFeaturedStock" SET date = date + INTERVAL '1 day';
CREATE UNIQUE INDEX "DailyFeaturedStock_date_position_key" ON "DailyFeaturedStock"("date", "position");

-- PurchaseRecommendation (unique: stockId, date)
DROP INDEX IF EXISTS "PurchaseRecommendation_stockId_date_key";
UPDATE "PurchaseRecommendation" SET date = date + INTERVAL '1 day';
CREATE UNIQUE INDEX "PurchaseRecommendation_stockId_date_key" ON "PurchaseRecommendation"("stockId", "date");

-- UserDailyRecommendation (unique: userId, date, position)
DROP INDEX IF EXISTS "UserDailyRecommendation_userId_date_position_key";
UPDATE "UserDailyRecommendation" SET date = date + INTERVAL '1 day';
CREATE UNIQUE INDEX "UserDailyRecommendation_userId_date_position_key" ON "UserDailyRecommendation"("userId", "date", "position");

-- DailyMarketMover (unique: date, type, position)
DROP INDEX IF EXISTS "DailyMarketMover_date_type_position_key";
UPDATE "DailyMarketMover" SET date = date + INTERVAL '1 day';
CREATE UNIQUE INDEX "DailyMarketMover_date_type_position_key" ON "DailyMarketMover"("date", "type", "position");

-- DailyAIReport (unique: date)
DROP INDEX IF EXISTS "DailyAIReport_date_key";
UPDATE "DailyAIReport" SET date = date + INTERVAL '1 day';
CREATE UNIQUE INDEX "DailyAIReport_date_key" ON "DailyAIReport"("date");

-- WeeklyAIReport (unique: weekStart)
DROP INDEX IF EXISTS "WeeklyAIReport_weekStart_key";
UPDATE "WeeklyAIReport" SET "weekStart" = "weekStart" + INTERVAL '1 day', "weekEnd" = "weekEnd" + INTERVAL '1 day';
CREATE UNIQUE INDEX "WeeklyAIReport_weekStart_key" ON "WeeklyAIReport"("weekStart");
