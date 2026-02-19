-- @db.Date カラムの日付がJSTから1日ズレていたのを修正
-- getTodayForDB() が JST→UTC変換時にdate型で1日前になっていた問題の既存データ補正
-- ユニーク制約の衝突を避けるため、一時的に制約を無効化して一括更新

-- SectorTrend (unique: date_sector)
UPDATE "SectorTrend" SET date = date + INTERVAL '1 day';

-- DailyFeaturedStock (unique: date_position)
UPDATE "DailyFeaturedStock" SET date = date + INTERVAL '1 day';

-- PurchaseRecommendation (unique: stockId_date)
UPDATE "PurchaseRecommendation" SET date = date + INTERVAL '1 day';

-- UserDailyRecommendation (unique: userId_date_position)
-- ユニーク制約の衝突を避けるため制約を一時的に削除して再作成
ALTER TABLE "UserDailyRecommendation" DROP CONSTRAINT IF EXISTS "UserDailyRecommendation_userId_date_position_key";
UPDATE "UserDailyRecommendation" SET date = date + INTERVAL '1 day';
CREATE UNIQUE INDEX "UserDailyRecommendation_userId_date_position_key" ON "UserDailyRecommendation"("userId", "date", "position");

-- DailyMarketMover (unique: date_type_position)
ALTER TABLE "DailyMarketMover" DROP CONSTRAINT IF EXISTS "DailyMarketMover_date_type_position_key";
UPDATE "DailyMarketMover" SET date = date + INTERVAL '1 day';
CREATE UNIQUE INDEX "DailyMarketMover_date_type_position_key" ON "DailyMarketMover"("date", "type", "position");

-- DailyAIReport (unique: date)
UPDATE "DailyAIReport" SET date = date + INTERVAL '1 day';

-- WeeklyAIReport (unique: weekStart)
UPDATE "WeeklyAIReport" SET "weekStart" = "weekStart" + INTERVAL '1 day', "weekEnd" = "weekEnd" + INTERVAL '1 day';
