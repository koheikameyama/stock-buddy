-- AlterTable: PortfolioStock に quantity カラムを追加
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 0;

-- バックフィル: 既存データの quantity を Transaction から計算して更新
UPDATE "PortfolioStock" ps
SET "quantity" = GREATEST(0, COALESCE(
  (SELECT SUM(CASE WHEN t."type" = 'buy' THEN t."quantity" ELSE -t."quantity" END)
   FROM "Transaction" t WHERE t."portfolioStockId" = ps."id"), 0
));
