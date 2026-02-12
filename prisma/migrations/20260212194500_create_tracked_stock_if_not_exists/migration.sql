-- TrackedStock テーブルを作成（存在しない場合のみ）
CREATE TABLE IF NOT EXISTS "TrackedStock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedStock_pkey" PRIMARY KEY ("id")
);

-- インデックス作成（存在しない場合のみ）
CREATE UNIQUE INDEX IF NOT EXISTS "TrackedStock_userId_stockId_key" ON "TrackedStock"("userId", "stockId");
CREATE INDEX IF NOT EXISTS "TrackedStock_userId_idx" ON "TrackedStock"("userId");
CREATE INDEX IF NOT EXISTS "TrackedStock_stockId_idx" ON "TrackedStock"("stockId");

-- 外部キー制約（存在しない場合のみ追加）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'TrackedStock_userId_fkey'
    ) THEN
        ALTER TABLE "TrackedStock" ADD CONSTRAINT "TrackedStock_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'TrackedStock_stockId_fkey'
    ) THEN
        ALTER TABLE "TrackedStock" ADD CONSTRAINT "TrackedStock_stockId_fkey"
        FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
