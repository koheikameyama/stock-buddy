#!/bin/bash
#
# 本番環境の銘柄データをローカルDBにコピーするスクリプト
#
# 使い方:
#   ./scripts/sync-stocks-from-production.sh
#
# 必要な環境変数:
#   - PRODUCTION_DATABASE_URL: 本番DBのURL（Railwayから取得）
#   - LOCAL_DATABASE_URL: ローカルDBのURL（デフォルト: postgresql://kouheikameyama@localhost:5432/stock_buddy）
#
# ※ 株価データはリアルタイム取得に移行したため、Stockテーブルのみ同期
#

set -e  # エラーが発生したら停止

# カラー出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# .envファイルを読み込む
if [ -f .env ]; then
  echo -e "${BLUE}📄 .envファイルを読み込み中...${NC}"
  export $(grep -v '^#' .env | xargs)
  echo -e "${GREEN}✓ .envファイルを読み込みました${NC}"
  echo ""
fi

echo -e "${BLUE}🔄 本番環境からローカルへ銘柄データを同期${NC}"
echo ""

# 1. 環境変数チェック
if [ -z "$PRODUCTION_DATABASE_URL" ]; then
  echo -e "${YELLOW}⚠️  PRODUCTION_DATABASE_URL が設定されていません${NC}"
  echo "Railwayから取得します..."

  PRODUCTION_DATABASE_URL=$(railway variables --json 2>/dev/null | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")

  if [ -z "$PRODUCTION_DATABASE_URL" ]; then
    echo -e "${RED}❌ エラー: Railway URLを取得できませんでした${NC}"
    echo "手動で設定してください: export PRODUCTION_DATABASE_URL='...'"
    exit 1
  fi

  echo -e "${GREEN}✓ Railway URLを取得しました${NC}"
fi

# ローカルDBのデフォルト設定
LOCAL_DATABASE_URL=${LOCAL_DATABASE_URL:-"postgresql://kouheikameyama@localhost:5432/stock_buddy"}

echo -e "${BLUE}📋 設定確認${NC}"
echo "  本番DB: ${PRODUCTION_DATABASE_URL:0:50}..."
echo "  ローカルDB: $LOCAL_DATABASE_URL"
echo ""

# 2. 自動実行（確認プロンプトなし）
echo -e "${BLUE}💾 本番データをローカルにコピーします${NC}"

# 3. 一時ファイル
TMP_STOCKS="/tmp/stocks_dump.sql"

echo -e "${BLUE}📦 本番DBからデータをエクスポート中...${NC}"

# 4. 本番DBからStockテーブルをエクスポート（カラム順序を明示的に指定）
echo "  - Stockテーブル"
psql "$PRODUCTION_DATABASE_URL" -c "\COPY (SELECT id, \"tickerCode\", name, market, sector, \"createdAt\", \"dividendYield\", \"marketCap\" FROM \"Stock\") TO STDOUT CSV HEADER" > "$TMP_STOCKS.csv"

STOCK_COUNT=$(wc -l < "$TMP_STOCKS.csv")
STOCK_COUNT=$((STOCK_COUNT - 1))  # ヘッダー行を除く
echo -e "${GREEN}    ✓ ${STOCK_COUNT}件の銘柄データを取得${NC}"

echo ""
echo -e "${BLUE}📥 ローカルDBにインポート中...${NC}"

# 5. ローカルDBの既存データを削除（常に上書き）
EXISTING_STOCKS=$(psql "$LOCAL_DATABASE_URL" -t -c "SELECT COUNT(*) FROM \"Stock\"" | xargs)

if [ "$EXISTING_STOCKS" -gt 0 ]; then
  echo -e "${YELLOW}  既存データを削除中...${NC}"
  echo "    - Stock: ${EXISTING_STOCKS}件"
  psql "$LOCAL_DATABASE_URL" -c "TRUNCATE \"Stock\" CASCADE;" > /dev/null
  echo -e "${GREEN}    ✓ 削除完了${NC}"
fi

# 6. Stockテーブルをインポート（カラム順序を明示的に指定）
echo "  - Stockテーブルをインポート中..."
psql "$LOCAL_DATABASE_URL" -c "\COPY \"Stock\" (id, \"tickerCode\", name, market, sector, \"createdAt\", \"dividendYield\", \"marketCap\") FROM '$TMP_STOCKS.csv' CSV HEADER" 2>&1 | grep -v "ERROR.*duplicate key" || true
echo -e "${GREEN}    ✓ インポート完了${NC}"

# 7. 結果確認
echo ""
echo -e "${BLUE}📊 同期結果${NC}"

FINAL_STOCKS=$(psql "$LOCAL_DATABASE_URL" -t -c "SELECT COUNT(*) FROM \"Stock\"" | xargs)

echo "  - Stock: ${FINAL_STOCKS}件"

# 8. 一時ファイル削除
rm -f "$TMP_STOCKS.csv"

echo ""
echo -e "${GREEN}✨ 同期完了！${NC}"
