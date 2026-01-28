-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "monthlyAmount" INTEGER NOT NULL DEFAULT 0;

-- Update existing records to set default value
UPDATE "UserSettings" SET "monthlyAmount" = 0 WHERE "monthlyAmount" IS NULL;
