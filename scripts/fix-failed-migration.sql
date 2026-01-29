-- 失敗したマイグレーションレコードを削除
DELETE FROM "_prisma_migrations"
WHERE migration_name = '20260129213908_add_stock_analyses'
  AND finished_at IS NULL;
