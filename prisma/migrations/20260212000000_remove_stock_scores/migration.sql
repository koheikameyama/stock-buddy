-- DropColumns: Stock scores (unused)
ALTER TABLE "Stock" DROP COLUMN IF EXISTS "beginnerScore";
ALTER TABLE "Stock" DROP COLUMN IF EXISTS "growthScore";
ALTER TABLE "Stock" DROP COLUMN IF EXISTS "dividendScore";
ALTER TABLE "Stock" DROP COLUMN IF EXISTS "stabilityScore";
ALTER TABLE "Stock" DROP COLUMN IF EXISTS "liquidityScore";
