-- 既存の "pass" を "hold" に統一
UPDATE "PurchaseRecommendation" SET recommendation = 'hold' WHERE recommendation = 'pass';
