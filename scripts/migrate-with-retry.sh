#!/bin/sh

# マイグレーションエラーの場合、失敗したマイグレーションをロールバック済みとしてマークして再試行
npx prisma migrate deploy || {
  echo "Migration failed, attempting to resolve..."
  npx prisma migrate resolve --rolled-back 20260129213908_add_stock_analyses
  echo "Retrying migration..."
  npx prisma migrate deploy
}
