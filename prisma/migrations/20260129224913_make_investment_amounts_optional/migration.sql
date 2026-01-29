-- AlterTable
ALTER TABLE "UserSettings" ALTER COLUMN "investmentAmount" DROP NOT NULL;
ALTER TABLE "UserSettings" ALTER COLUMN "investmentAmount" DROP DEFAULT;
ALTER TABLE "UserSettings" ALTER COLUMN "monthlyAmount" DROP NOT NULL;
ALTER TABLE "UserSettings" ALTER COLUMN "monthlyAmount" DROP DEFAULT;
