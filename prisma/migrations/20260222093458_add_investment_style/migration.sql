-- AlterTable: 投資スタイルフィールドを追加（investment_period, riskToleranceを削除）
-- Step 1: 新しいカラムを追加（一時的にNULL許可）
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "investmentStyle" TEXT;

-- Step 2: 既存データをriskToleranceからinvestmentStyleに変換
UPDATE "UserSettings"
SET "investmentStyle" = CASE
  WHEN "riskTolerance" = 'low' THEN 'CONSERVATIVE'
  WHEN "riskTolerance" = 'high' THEN 'AGGRESSIVE'
  ELSE 'BALANCED'
END
WHERE "investmentStyle" IS NULL;

-- Step 3: investmentStyleをNOT NULLに変更
ALTER TABLE "UserSettings" ALTER COLUMN "investmentStyle" SET NOT NULL;

-- Step 4: 古いカラムを削除
ALTER TABLE "UserSettings" DROP COLUMN IF EXISTS "investmentPeriod";
ALTER TABLE "UserSettings" DROP COLUMN IF EXISTS "riskTolerance";
