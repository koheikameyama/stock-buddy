#!/bin/sh

# 失敗したマイグレーションレコードをクリーンアップ
echo "Checking for failed migrations..."
npx prisma db execute --file scripts/fix-failed-migration.sql --schema prisma/schema.prisma || echo "No failed migrations to clean up"

# マイグレーションを実行
echo "Running migrations..."
npx prisma migrate deploy
