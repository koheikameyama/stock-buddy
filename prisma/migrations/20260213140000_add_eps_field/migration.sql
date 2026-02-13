-- AlterTable: EPSフィールドを追加
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "eps" DECIMAL(12, 2);
