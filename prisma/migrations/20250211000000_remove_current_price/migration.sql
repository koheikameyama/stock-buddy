-- AlterTable: Remove currentPrice column from Stock table
-- This column is no longer needed as stock prices are now fetched in real-time via yfinance
ALTER TABLE "Stock" DROP COLUMN IF EXISTS "currentPrice";
