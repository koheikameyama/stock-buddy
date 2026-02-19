-- AlterTable
ALTER TABLE "RecommendationOutcome" ADD COLUMN IF NOT EXISTS "sectorTrendScore" DOUBLE PRECISION;
ALTER TABLE "RecommendationOutcome" ADD COLUMN IF NOT EXISTS "sectorTrendDirection" TEXT;
