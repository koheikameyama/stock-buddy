-- CreateIndex
-- First, remove any duplicate entries keeping the latest one
DELETE FROM "FeaturedStock" a USING "FeaturedStock" b
WHERE a."stockId" = b."stockId"
  AND a."date" = b."date"
  AND a."createdAt" < b."createdAt";

-- Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "FeaturedStock_stockId_date_key" ON "FeaturedStock"("stockId", "date");
