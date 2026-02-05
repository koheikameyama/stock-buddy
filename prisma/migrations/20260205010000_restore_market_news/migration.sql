-- CreateTable
CREATE TABLE IF NOT EXISTS "MarketNews" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "url" TEXT,
    "source" TEXT NOT NULL DEFAULT 'tavily',
    "sector" TEXT,
    "sentiment" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketNews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketNews_publishedAt_idx" ON "MarketNews"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketNews_sector_idx" ON "MarketNews"("sector");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketNews_source_idx" ON "MarketNews"("source");
