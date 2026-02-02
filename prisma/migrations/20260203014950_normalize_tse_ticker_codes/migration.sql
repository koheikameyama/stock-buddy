-- Normalize TSE ticker codes to always include .T suffix
-- This prevents duplicate entries like "9432" and "9432.T"

DO $$
DECLARE
  stock_without_t RECORD;
  stock_with_t_id uuid;
BEGIN
  -- Loop through stocks without .T on TSE
  FOR stock_without_t IN
    SELECT id, "tickerCode"
    FROM "Stock"
    WHERE market = 'TSE'
      AND "tickerCode" NOT LIKE '%.T'
      AND "tickerCode" ~ '^[0-9]+$'
  LOOP
    -- Check if stock with .T already exists
    SELECT id INTO stock_with_t_id
    FROM "Stock"
    WHERE "tickerCode" = stock_without_t."tickerCode" || '.T';

    IF stock_with_t_id IS NOT NULL THEN
      -- If .T version exists, migrate references and delete old one

      -- Update UserStock references
      UPDATE "UserStock"
      SET "stockId" = stock_with_t_id
      WHERE "stockId" = stock_without_t.id;

      -- Update DailyFeaturedStock references
      UPDATE "DailyFeaturedStock"
      SET "stockId" = stock_with_t_id
      WHERE "stockId" = stock_without_t.id;

      -- Update StockPrice references
      UPDATE "StockPrice"
      SET "stockId" = stock_with_t_id
      WHERE "stockId" = stock_without_t.id;

      -- Update StockAnalysis references
      UPDATE "StockAnalysis"
      SET "stockId" = stock_with_t_id
      WHERE "stockId" = stock_without_t.id;

      -- Delete the stock without .T
      DELETE FROM "Stock" WHERE id = stock_without_t.id;

      RAISE NOTICE 'Merged % into %.T', stock_without_t."tickerCode", stock_without_t."tickerCode";
    ELSE
      -- If .T version doesn't exist, just add .T to the ticker code
      UPDATE "Stock"
      SET "tickerCode" = "tickerCode" || '.T'
      WHERE id = stock_without_t.id;

      RAISE NOTICE 'Added .T to %', stock_without_t."tickerCode";
    END IF;
  END LOOP;
END $$;
