-- CreateTable
CREATE TABLE IF NOT EXISTS "UserDailyRecommendation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "stockId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDailyRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserDailyRecommendation_userId_date_position_key" ON "UserDailyRecommendation"("userId", "date", "position");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserDailyRecommendation_userId_date_idx" ON "UserDailyRecommendation"("userId", "date" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserDailyRecommendation_stockId_idx" ON "UserDailyRecommendation"("stockId");

-- AddForeignKey
ALTER TABLE "UserDailyRecommendation" ADD CONSTRAINT "UserDailyRecommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDailyRecommendation" ADD CONSTRAINT "UserDailyRecommendation_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
