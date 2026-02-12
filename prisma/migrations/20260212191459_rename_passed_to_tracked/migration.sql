-- PassedStockTracking を TrackedStock にリネーム＆シンプル化
-- 既存データは削除（使われていないため）

-- 既存テーブルを削除
DROP TABLE IF EXISTS "PassedStockTracking";

-- 新しいシンプルなテーブルを作成
CREATE TABLE "TrackedStock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedStock_pkey" PRIMARY KEY ("id")
);

-- インデックス作成
CREATE UNIQUE INDEX "TrackedStock_userId_stockId_key" ON "TrackedStock"("userId", "stockId");
CREATE INDEX "TrackedStock_userId_idx" ON "TrackedStock"("userId");
CREATE INDEX "TrackedStock_stockId_idx" ON "TrackedStock"("stockId");

-- 外部キー制約
ALTER TABLE "TrackedStock" ADD CONSTRAINT "TrackedStock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrackedStock" ADD CONSTRAINT "TrackedStock_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
