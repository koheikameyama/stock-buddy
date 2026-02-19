-- AlterTable
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "businessDescription" TEXT;
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "businessDescriptionUpdatedAt" TIMESTAMP(3);
