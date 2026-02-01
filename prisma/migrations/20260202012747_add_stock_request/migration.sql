-- CreateTable
CREATE TABLE IF NOT EXISTS "StockRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tickerCode" TEXT NOT NULL,
    "name" TEXT,
    "market" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockRequest_userId_idx" ON "StockRequest"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockRequest_status_idx" ON "StockRequest"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockRequest_tickerCode_idx" ON "StockRequest"("tickerCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockRequest_createdAt_idx" ON "StockRequest"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
