-- AlterTable: UserDailyRecommendation に投資テーマを追加
ALTER TABLE "UserDailyRecommendation" ADD COLUMN IF NOT EXISTS "investmentTheme" TEXT;

-- AlterTable: WatchlistStock におすすめ経由の情報を追加
ALTER TABLE "WatchlistStock" ADD COLUMN IF NOT EXISTS "investmentTheme" TEXT;
ALTER TABLE "WatchlistStock" ADD COLUMN IF NOT EXISTS "recommendationReason" TEXT;
