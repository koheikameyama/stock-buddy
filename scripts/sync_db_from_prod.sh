#!/bin/bash
# 本番DBからローカルDBにデータを同期するスクリプト
# 使い方: ./scripts/sync_db_from_prod.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# .envから環境変数を読み込み
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(grep -E "^PRODUCTION_DATABASE_URL=" "$PROJECT_ROOT/.env" | xargs)
    export $(grep -E "^DATABASE_URL=" "$PROJECT_ROOT/.env" | head -1 | xargs)
fi

if [ -z "$PRODUCTION_DATABASE_URL" ]; then
    echo "PRODUCTION_DATABASE_URLが設定されていません。"
    echo ".envファイルを確認してください。"
    exit 1
fi

# URLをパース
PROD_HOST=$(echo $PRODUCTION_DATABASE_URL | sed -E 's|.*@([^:]+):.*|\1|')
PROD_PORT=$(echo $PRODUCTION_DATABASE_URL | sed -E 's|.*:([0-9]+)/.*|\1|')
PROD_USER=$(echo $PRODUCTION_DATABASE_URL | sed -E 's|.*://([^:]+):.*|\1|')
PROD_PASSWORD=$(echo $PRODUCTION_DATABASE_URL | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
PROD_DB=$(echo $PRODUCTION_DATABASE_URL | sed -E 's|.*/([^?]+).*|\1|')

# ローカルDB設定
LOCAL_HOST="localhost"
LOCAL_PORT="5432"
LOCAL_USER="kouheikameyama"
LOCAL_DB="stock_buddy"

PG_DUMP="/opt/homebrew/opt/postgresql@17/bin/pg_dump"
PG_RESTORE="/opt/homebrew/opt/postgresql@17/bin/pg_restore"
BACKUP_FILE="/tmp/stock_buddy_prod.backup"

echo "=== 本番DB → ローカルDB 同期スクリプト ==="
echo ""

# PostgreSQL 17の確認
if [ ! -f "$PG_DUMP" ]; then
    echo "PostgreSQL 17がインストールされていません。"
    echo "brew install postgresql@17 を実行してください。"
    exit 1
fi

# ダンプ
echo "[1/2] 本番DBからダンプ中..."
PGPASSWORD=$PROD_PASSWORD $PG_DUMP \
    -h $PROD_HOST \
    -p $PROD_PORT \
    -U $PROD_USER \
    -d $PROD_DB \
    -Fc \
    -f $BACKUP_FILE

echo "      ダンプ完了: $BACKUP_FILE"

# リストア
echo "[2/2] ローカルDBにリストア中..."
$PG_RESTORE \
    -h $LOCAL_HOST \
    -p $LOCAL_PORT \
    -U $LOCAL_USER \
    -d $LOCAL_DB \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    $BACKUP_FILE 2>/dev/null || true

echo ""
echo "=== 同期完了 ==="

# 確認
echo ""
echo "テーブルのレコード数:"
psql -h $LOCAL_HOST -U $LOCAL_USER -d $LOCAL_DB -c \
    "SELECT 'User' as table_name, COUNT(*) FROM \"User\" UNION ALL SELECT 'Stock', COUNT(*) FROM \"Stock\" UNION ALL SELECT 'PortfolioStock', COUNT(*) FROM \"PortfolioStock\" UNION ALL SELECT 'WatchlistStock', COUNT(*) FROM \"WatchlistStock\" ORDER BY table_name;"

# クリーンアップ
rm -f $BACKUP_FILE
echo ""
echo "一時ファイルを削除しました。"
