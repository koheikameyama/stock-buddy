-- CreateTable
CREATE TABLE "HotStock" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "hotScore" INTEGER NOT NULL,
    "reasons" TEXT[],
    "risks" TEXT[],
    "recommendedBudgetPercent" INTEGER NOT NULL,
    "recommendation" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotStock_stockId_idx" ON "HotStock"("stockId");

-- CreateIndex
CREATE INDEX "HotStock_hotScore_idx" ON "HotStock"("hotScore");

-- CreateIndex
CREATE INDEX "HotStock_validUntil_idx" ON "HotStock"("validUntil");

-- CreateIndex
CREATE INDEX "HotStock_analyzedAt_idx" ON "HotStock"("analyzedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HotStock_stockId_analyzedAt_key" ON "HotStock"("stockId", "analyzedAt");

-- AddForeignKey
ALTER TABLE "HotStock" ADD CONSTRAINT "HotStock_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
