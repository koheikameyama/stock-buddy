-- CreateTable: WatchlistStock
CREATE TABLE "WatchlistStock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "addedReason" TEXT,
    "alertPrice" DECIMAL(12,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchlistStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PortfolioStock
CREATE TABLE "PortfolioStock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "averagePurchasePrice" DECIMAL(12,2) NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "lastAnalysis" TIMESTAMP(3),
    "shortTerm" TEXT,
    "mediumTerm" TEXT,
    "longTerm" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Transaction
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "portfolioStockId" TEXT,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PurchaseRecommendation
CREATE TABLE "PurchaseRecommendation" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "recommendation" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "recommendedQuantity" INTEGER,
    "recommendedPrice" DECIMAL(12,2),
    "estimatedAmount" DECIMAL(15,2),
    "reason" TEXT NOT NULL,
    "caution" TEXT NOT NULL,
    "analysisData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistStock_userId_stockId_key" ON "WatchlistStock"("userId", "stockId");
CREATE INDEX "WatchlistStock_userId_idx" ON "WatchlistStock"("userId");
CREATE INDEX "WatchlistStock_stockId_idx" ON "WatchlistStock"("stockId");

CREATE UNIQUE INDEX "PortfolioStock_userId_stockId_key" ON "PortfolioStock"("userId", "stockId");
CREATE INDEX "PortfolioStock_userId_idx" ON "PortfolioStock"("userId");
CREATE INDEX "PortfolioStock_stockId_idx" ON "PortfolioStock"("stockId");

CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");
CREATE INDEX "Transaction_stockId_idx" ON "Transaction"("stockId");
CREATE INDEX "Transaction_portfolioStockId_idx" ON "Transaction"("portfolioStockId");
CREATE INDEX "Transaction_transactionDate_idx" ON "Transaction"("transactionDate" DESC);
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

CREATE UNIQUE INDEX "PurchaseRecommendation_stockId_date_key" ON "PurchaseRecommendation"("stockId", "date");
CREATE INDEX "PurchaseRecommendation_date_idx" ON "PurchaseRecommendation"("date");
CREATE INDEX "PurchaseRecommendation_stockId_idx" ON "PurchaseRecommendation"("stockId");

-- AddForeignKey
ALTER TABLE "WatchlistStock" ADD CONSTRAINT "WatchlistStock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WatchlistStock" ADD CONSTRAINT "WatchlistStock_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PortfolioStock" ADD CONSTRAINT "PortfolioStock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioStock" ADD CONSTRAINT "PortfolioStock_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_portfolioStockId_fkey" FOREIGN KEY ("portfolioStockId") REFERENCES "PortfolioStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseRecommendation" ADD CONSTRAINT "PurchaseRecommendation_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- データ移行: UserStock → WatchlistStock (quantity IS NULL)
INSERT INTO "WatchlistStock" (id, "userId", "stockId", "addedReason", note, "createdAt", "updatedAt")
SELECT
  id,
  "userId",
  "stockId",
  NULL as "addedReason",
  note,
  "createdAt",
  "updatedAt"
FROM "UserStock"
WHERE quantity IS NULL;

-- データ移行: UserStock → PortfolioStock (quantity IS NOT NULL)
INSERT INTO "PortfolioStock" (
  id,
  "userId",
  "stockId",
  quantity,
  "averagePurchasePrice",
  "purchaseDate",
  note,
  "lastAnalysis",
  "shortTerm",
  "mediumTerm",
  "longTerm",
  "createdAt",
  "updatedAt"
)
SELECT
  id,
  "userId",
  "stockId",
  quantity,
  "averagePurchasePrice",
  "purchaseDate",
  note,
  "lastAnalysis",
  "shortTerm",
  "mediumTerm",
  "longTerm",
  "createdAt",
  "updatedAt"
FROM "UserStock"
WHERE quantity IS NOT NULL;

-- DropTable: UserStock
DROP TABLE "UserStock";
