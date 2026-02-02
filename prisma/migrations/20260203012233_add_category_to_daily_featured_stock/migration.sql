-- AlterTable
ALTER TABLE "DailyFeaturedStock" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'stable';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DailyFeaturedStock_date_category_idx" ON "DailyFeaturedStock"("date", "category");
