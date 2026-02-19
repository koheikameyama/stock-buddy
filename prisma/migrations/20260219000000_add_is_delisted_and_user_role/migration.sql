-- AlterTable: Stock に上場廃止フラグを追加
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "isDelisted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: User にロールを追加
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'user';
