-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "termsAcceptedAt" TIMESTAMP(3),
    "privacyPolicyAccepted" BOOLEAN NOT NULL DEFAULT false,
    "privacyPolicyAcceptedAt" TIMESTAMP(3),
    "subscriptionPlan" TEXT NOT NULL DEFAULT 'free',
    "subscriptionExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "investmentPeriod" TEXT NOT NULL,
    "riskTolerance" TEXT NOT NULL,
    "investmentBudget" INTEGER,
    "targetReturnRate" INTEGER,
    "stopLossRate" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL,
    "tickerCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "sector" TEXT,
    "marketCap" DECIMAL(65,30),
    "dividendYield" DECIMAL(65,30),
    "pbr" DECIMAL(8,2),
    "per" DECIMAL(8,2),
    "roe" DECIMAL(8,4),
    "operatingCF" DECIMAL(15,2),
    "freeCF" DECIMAL(15,2),
    "fiftyTwoWeekHigh" DECIMAL(12,2),
    "fiftyTwoWeekLow" DECIMAL(12,2),
    "latestPrice" DECIMAL(12,2),
    "latestVolume" BIGINT,
    "dailyChangeRate" DECIMAL(8,2),
    "weekChangeRate" DECIMAL(8,2),
    "volatility" DECIMAL(8,2),
    "volumeRatio" DECIMAL(8,2),
    "priceUpdatedAt" TIMESTAMP(3),
    "financialDataUpdatedAt" TIMESTAMP(3),
    "latestRevenue" DECIMAL(18,0),
    "latestNetIncome" DECIMAL(18,0),
    "revenueGrowth" DECIMAL(8,2),
    "netIncomeGrowth" DECIMAL(8,2),
    "eps" DECIMAL(12,2),
    "isProfitable" BOOLEAN,
    "profitTrend" TEXT,
    "earningsUpdatedAt" TIMESTAMP(3),
    "listedDate" TIMESTAMP(3),
    "fetchFailCount" INTEGER NOT NULL DEFAULT 0,
    "lastFetchFailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketNews" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "url" TEXT,
    "source" TEXT NOT NULL DEFAULT 'tavily',
    "sector" TEXT,
    "sentiment" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "market" TEXT NOT NULL DEFAULT 'JP',
    "region" TEXT,

    CONSTRAINT "MarketNews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAnalysis" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "shortTermTrend" TEXT NOT NULL,
    "shortTermPriceLow" DECIMAL(12,2) NOT NULL,
    "shortTermPriceHigh" DECIMAL(12,2) NOT NULL,
    "midTermTrend" TEXT NOT NULL,
    "midTermPriceLow" DECIMAL(12,2) NOT NULL,
    "midTermPriceHigh" DECIMAL(12,2) NOT NULL,
    "longTermTrend" TEXT NOT NULL,
    "longTermPriceLow" DECIMAL(12,2) NOT NULL,
    "longTermPriceHigh" DECIMAL(12,2) NOT NULL,
    "recommendation" TEXT NOT NULL,
    "advice" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "limitPrice" DECIMAL(12,2),
    "stopLossPrice" DECIMAL(12,2),
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyFeaturedStock" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "stockId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'stable',
    "position" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyFeaturedStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockRequest" (
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

-- CreateTable
CREATE TABLE "WatchlistStock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "targetBuyPrice" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchlistStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioStock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "lastAnalysis" TIMESTAMP(3),
    "shortTerm" TEXT,
    "mediumTerm" TEXT,
    "longTerm" TEXT,
    "emotionalCoaching" TEXT,
    "simpleStatus" TEXT,
    "statusType" TEXT,
    "suggestedSellPrice" DECIMAL(12,2),
    "suggestedSellPercent" INTEGER,
    "sellCondition" TEXT,
    "sellReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRecommendation" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "recommendation" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "caution" TEXT NOT NULL,
    "positives" TEXT,
    "concerns" TEXT,
    "suitableFor" TEXT,
    "buyCondition" TEXT,
    "userFitScore" INTEGER,
    "budgetFit" BOOLEAN,
    "periodFit" BOOLEAN,
    "riskFit" BOOLEAN,
    "personalizedReason" TEXT,
    "analysisData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedStock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDailyRecommendation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "stockId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDailyRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AnalysisJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioOverallAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL,
    "sectorConcentration" DECIMAL(5,2),
    "sectorCount" INTEGER,
    "totalValue" DECIMAL(15,2),
    "totalCost" DECIMAL(15,2),
    "unrealizedGain" DECIMAL(15,2),
    "unrealizedGainPercent" DECIMAL(8,2),
    "portfolioVolatility" DECIMAL(8,2),
    "overallSummary" TEXT NOT NULL,
    "overallStatus" TEXT NOT NULL,
    "overallStatusType" TEXT NOT NULL,
    "metricsAnalysis" JSONB NOT NULL,
    "actionSuggestions" JSONB NOT NULL,
    "watchlistSimulation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioOverallAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyAIReport" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "dailyRecommendationCount" INTEGER,
    "dailyRecommendationAvgReturn" DECIMAL(8,2),
    "dailyRecommendationPlusRate" DECIMAL(5,2),
    "dailyRecommendationSuccessRate" DECIMAL(5,2),
    "dailyRecommendationImprovement" TEXT,
    "purchaseRecommendationCount" INTEGER,
    "purchaseRecommendationAvgReturn" DECIMAL(8,2),
    "purchaseRecommendationPlusRate" DECIMAL(5,2),
    "purchaseRecommendationSuccessRate" DECIMAL(5,2),
    "purchaseRecommendationImprovement" TEXT,
    "stockAnalysisCount" INTEGER,
    "stockAnalysisAvgReturn" DECIMAL(8,2),
    "stockAnalysisPlusRate" DECIMAL(5,2),
    "stockAnalysisSuccessRate" DECIMAL(5,2),
    "stockAnalysisImprovement" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyAIReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMarketMover" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "stockId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "changeRate" DECIMAL(8,2) NOT NULL,
    "analysis" TEXT NOT NULL,
    "relatedNews" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyMarketMover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "stockId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "triggerPrice" DECIMAL(12,2),
    "targetPrice" DECIMAL(12,2),
    "changeRate" DECIMAL(8,2),
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isPushSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationOutcome" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "tickerCode" TEXT NOT NULL,
    "sector" TEXT,
    "recommendedAt" TIMESTAMP(3) NOT NULL,
    "priceAtRec" DECIMAL(12,2) NOT NULL,
    "prediction" TEXT NOT NULL,
    "confidence" DECIMAL(5,2),
    "volatility" DECIMAL(8,2),
    "marketCap" BIGINT,
    "returnAfter1Day" DECIMAL(8,2),
    "returnAfter3Days" DECIMAL(8,2),
    "returnAfter7Days" DECIMAL(8,2),
    "returnAfter14Days" DECIMAL(8,2),
    "benchmarkReturn7Days" DECIMAL(8,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalValue" DECIMAL(15,2) NOT NULL,
    "totalCost" DECIMAL(15,2) NOT NULL,
    "unrealizedGain" DECIMAL(15,2) NOT NULL,
    "unrealizedGainPercent" DECIMAL(8,2) NOT NULL,
    "stockCount" INTEGER NOT NULL,
    "sectorBreakdown" JSONB,
    "stockBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_tickerCode_key" ON "Stock"("tickerCode");

-- CreateIndex
CREATE INDEX "Stock_tickerCode_idx" ON "Stock"("tickerCode");

-- CreateIndex
CREATE INDEX "MarketNews_publishedAt_idx" ON "MarketNews"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "MarketNews_sector_idx" ON "MarketNews"("sector");

-- CreateIndex
CREATE INDEX "MarketNews_source_idx" ON "MarketNews"("source");

-- CreateIndex
CREATE INDEX "MarketNews_market_idx" ON "MarketNews"("market");

-- CreateIndex
CREATE INDEX "StockAnalysis_stockId_analyzedAt_idx" ON "StockAnalysis"("stockId", "analyzedAt" DESC);

-- CreateIndex
CREATE INDEX "StockAnalysis_analyzedAt_idx" ON "StockAnalysis"("analyzedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "StockAnalysis_stockId_analyzedAt_key" ON "StockAnalysis"("stockId", "analyzedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "DailyFeaturedStock_date_idx" ON "DailyFeaturedStock"("date" DESC);

-- CreateIndex
CREATE INDEX "DailyFeaturedStock_stockId_idx" ON "DailyFeaturedStock"("stockId");

-- CreateIndex
CREATE INDEX "DailyFeaturedStock_date_category_idx" ON "DailyFeaturedStock"("date", "category");

-- CreateIndex
CREATE UNIQUE INDEX "DailyFeaturedStock_date_position_key" ON "DailyFeaturedStock"("date", "position");

-- CreateIndex
CREATE INDEX "StockRequest_userId_idx" ON "StockRequest"("userId");

-- CreateIndex
CREATE INDEX "StockRequest_status_idx" ON "StockRequest"("status");

-- CreateIndex
CREATE INDEX "StockRequest_tickerCode_idx" ON "StockRequest"("tickerCode");

-- CreateIndex
CREATE INDEX "StockRequest_createdAt_idx" ON "StockRequest"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "WatchlistStock_userId_idx" ON "WatchlistStock"("userId");

-- CreateIndex
CREATE INDEX "WatchlistStock_stockId_idx" ON "WatchlistStock"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistStock_userId_stockId_key" ON "WatchlistStock"("userId", "stockId");

-- CreateIndex
CREATE INDEX "PortfolioStock_userId_idx" ON "PortfolioStock"("userId");

-- CreateIndex
CREATE INDEX "PortfolioStock_stockId_idx" ON "PortfolioStock"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioStock_userId_stockId_key" ON "PortfolioStock"("userId", "stockId");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_stockId_idx" ON "Transaction"("stockId");

-- CreateIndex
CREATE INDEX "Transaction_portfolioStockId_idx" ON "Transaction"("portfolioStockId");

-- CreateIndex
CREATE INDEX "Transaction_transactionDate_idx" ON "Transaction"("transactionDate" DESC);

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "PurchaseRecommendation_date_idx" ON "PurchaseRecommendation"("date");

-- CreateIndex
CREATE INDEX "PurchaseRecommendation_stockId_idx" ON "PurchaseRecommendation"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRecommendation_stockId_date_key" ON "PurchaseRecommendation"("stockId", "date");

-- CreateIndex
CREATE INDEX "TrackedStock_userId_idx" ON "TrackedStock"("userId");

-- CreateIndex
CREATE INDEX "TrackedStock_stockId_idx" ON "TrackedStock"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedStock_userId_stockId_key" ON "TrackedStock"("userId", "stockId");

-- CreateIndex
CREATE INDEX "UserDailyRecommendation_userId_date_idx" ON "UserDailyRecommendation"("userId", "date" DESC);

-- CreateIndex
CREATE INDEX "UserDailyRecommendation_stockId_idx" ON "UserDailyRecommendation"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "UserDailyRecommendation_userId_date_position_key" ON "UserDailyRecommendation"("userId", "date", "position");

-- CreateIndex
CREATE INDEX "AnalysisJob_userId_idx" ON "AnalysisJob"("userId");

-- CreateIndex
CREATE INDEX "AnalysisJob_status_idx" ON "AnalysisJob"("status");

-- CreateIndex
CREATE INDEX "AnalysisJob_createdAt_idx" ON "AnalysisJob"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioOverallAnalysis_userId_key" ON "PortfolioOverallAnalysis"("userId");

-- CreateIndex
CREATE INDEX "PortfolioOverallAnalysis_userId_idx" ON "PortfolioOverallAnalysis"("userId");

-- CreateIndex
CREATE INDEX "PortfolioOverallAnalysis_analyzedAt_idx" ON "PortfolioOverallAnalysis"("analyzedAt" DESC);

-- CreateIndex
CREATE INDEX "WeeklyAIReport_weekStart_idx" ON "WeeklyAIReport"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyAIReport_weekStart_key" ON "WeeklyAIReport"("weekStart");

-- CreateIndex
CREATE INDEX "DailyMarketMover_date_idx" ON "DailyMarketMover"("date" DESC);

-- CreateIndex
CREATE INDEX "DailyMarketMover_stockId_idx" ON "DailyMarketMover"("stockId");

-- CreateIndex
CREATE INDEX "DailyMarketMover_date_type_idx" ON "DailyMarketMover"("date", "type");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMarketMover_date_type_position_key" ON "DailyMarketMover"("date", "type", "position");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_stockId_idx" ON "Notification"("stockId");

-- CreateIndex
CREATE INDEX "RecommendationOutcome_type_recommendedAt_idx" ON "RecommendationOutcome"("type", "recommendedAt");

-- CreateIndex
CREATE INDEX "RecommendationOutcome_sector_idx" ON "RecommendationOutcome"("sector");

-- CreateIndex
CREATE INDEX "RecommendationOutcome_tickerCode_idx" ON "RecommendationOutcome"("tickerCode");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationOutcome_type_recommendationId_key" ON "RecommendationOutcome"("type", "recommendationId");

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_userId_date_idx" ON "PortfolioSnapshot"("userId", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSnapshot_userId_date_key" ON "PortfolioSnapshot"("userId", "date");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAnalysis" ADD CONSTRAINT "StockAnalysis_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyFeaturedStock" ADD CONSTRAINT "DailyFeaturedStock_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistStock" ADD CONSTRAINT "WatchlistStock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistStock" ADD CONSTRAINT "WatchlistStock_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioStock" ADD CONSTRAINT "PortfolioStock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioStock" ADD CONSTRAINT "PortfolioStock_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_portfolioStockId_fkey" FOREIGN KEY ("portfolioStockId") REFERENCES "PortfolioStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRecommendation" ADD CONSTRAINT "PurchaseRecommendation_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedStock" ADD CONSTRAINT "TrackedStock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedStock" ADD CONSTRAINT "TrackedStock_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDailyRecommendation" ADD CONSTRAINT "UserDailyRecommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDailyRecommendation" ADD CONSTRAINT "UserDailyRecommendation_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioOverallAnalysis" ADD CONSTRAINT "PortfolioOverallAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMarketMover" ADD CONSTRAINT "DailyMarketMover_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationOutcome" ADD CONSTRAINT "RecommendationOutcome_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

