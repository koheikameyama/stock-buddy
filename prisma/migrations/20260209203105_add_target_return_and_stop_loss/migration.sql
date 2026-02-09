-- AlterTable: UserSettings - 目標利益率と損切りラインを追加
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "targetReturnRate" INTEGER;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "stopLossRate" INTEGER;

-- AlterTable: PortfolioStock - 個別目標利益率と損切りラインを追加
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "targetReturnRate" INTEGER;
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "stopLossRate" INTEGER;
