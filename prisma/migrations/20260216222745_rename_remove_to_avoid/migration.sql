-- データ更新: recommendation の値を 'remove' から 'avoid' に変更
UPDATE "PurchaseRecommendation" SET recommendation = 'avoid' WHERE recommendation = 'remove';
