-- 失敗したマイグレーションレコードを削除（完了していないもの）
DELETE FROM "_prisma_migrations"
WHERE migration_name = '20260129213908_add_stock_analyses'
  AND finished_at IS NULL;

-- もし成功済みだが問題がある場合も削除して再実行できるようにする
-- DELETE FROM "_prisma_migrations"
-- WHERE migration_name = '20260129213908_add_stock_analyses';
