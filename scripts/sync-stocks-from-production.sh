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

set -e  # エラーが発生したら停止

# カラー出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# 2. 確認プロンプト
read -p "$(echo -e ${YELLOW}本番データをローカルにコピーします。続行しますか？ [y/N]: ${NC})" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${RED}✗ キャンセルしました${NC}"
  exit 0
fi

# 3. 一時ファイル
TMP_STOCKS="/tmp/stocks_dump.sql"
TMP_PRICES="/tmp/stock_prices_dump.sql"

echo -e "${BLUE}📦 本番DBからデータをエクスポート中...${NC}"

# 4. 本番DBからStockテーブルをエクスポート
echo "  - Stockテーブル"
psql "$PRODUCTION_DATABASE_URL" -c "\COPY (SELECT * FROM \"Stock\") TO STDOUT CSV HEADER" > "$TMP_STOCKS.csv"

STOCK_COUNT=$(wc -l < "$TMP_STOCKS.csv")
STOCK_COUNT=$((STOCK_COUNT - 1))  # ヘッダー行を除く
echo -e "${GREEN}    ✓ ${STOCK_COUNT}件の銘柄データを取得${NC}"

# 5. 本番DBからStockPriceテーブルをエクスポート
echo "  - StockPriceテーブル"
psql "$PRODUCTION_DATABASE_URL" -c "\COPY (SELECT * FROM \"StockPrice\") TO STDOUT CSV HEADER" > "$TMP_PRICES.csv"

PRICE_COUNT=$(wc -l < "$TMP_PRICES.csv")
PRICE_COUNT=$((PRICE_COUNT - 1))  # ヘッダー行を除く
echo -e "${GREEN}    ✓ ${PRICE_COUNT}件の株価データを取得${NC}"

echo ""
echo -e "${BLUE}📥 ローカルDBにインポート中...${NC}"

# 6. ローカルDBに既存データがあるか確認
EXISTING_STOCKS=$(psql "$LOCAL_DATABASE_URL" -t -c "SELECT COUNT(*) FROM \"Stock\"" | xargs)
EXISTING_PRICES=$(psql "$LOCAL_DATABASE_URL" -t -c "SELECT COUNT(*) FROM \"StockPrice\"" | xargs)

if [ "$EXISTING_STOCKS" -gt 0 ] || [ "$EXISTING_PRICES" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  ローカルDBに既存データがあります:${NC}"
  echo "    - Stock: ${EXISTING_STOCKS}件"
  echo "    - StockPrice: ${EXISTING_PRICES}件"
  echo ""
  read -p "$(echo -e ${YELLOW}既存データを削除して上書きしますか？ [y/N]: ${NC})" -n 1 -r
  echo

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "  - 既存データを削除中..."
    psql "$LOCAL_DATABASE_URL" -c "TRUNCATE \"StockPrice\", \"Stock\" CASCADE;" > /dev/null
    echo -e "${GREEN}    ✓ 削除完了${NC}"
  else
    echo -e "${YELLOW}  → マージモードでインポートします（重複はスキップ）${NC}"
  fi
fi

# 7. Stockテーブルをインポート
echo "  - Stockテーブルをインポート中..."
psql "$LOCAL_DATABASE_URL" -c "\COPY \"Stock\" FROM '$TMP_STOCKS.csv' CSV HEADER" 2>&1 | grep -v "ERROR.*duplicate key" || true
echo -e "${GREEN}    ✓ インポート完了${NC}"

# 8. StockPriceテーブルをインポート
echo "  - StockPriceテーブルをインポート中..."
psql "$LOCAL_DATABASE_URL" -c "\COPY \"StockPrice\" FROM '$TMP_PRICES.csv' CSV HEADER" 2>&1 | grep -v "ERROR.*duplicate key" || true
echo -e "${GREEN}    ✓ インポート完了${NC}"

# 9. 結果確認
echo ""
echo -e "${BLUE}📊 同期結果${NC}"

FINAL_STOCKS=$(psql "$LOCAL_DATABASE_URL" -t -c "SELECT COUNT(*) FROM \"Stock\"" | xargs)
FINAL_PRICES=$(psql "$LOCAL_DATABASE_URL" -t -c "SELECT COUNT(*) FROM \"StockPrice\"" | xargs)

echo "  - Stock: ${FINAL_STOCKS}件"
echo "  - StockPrice: ${FINAL_PRICES}件"

# 10. 一時ファイル削除
rm -f "$TMP_STOCKS.csv" "$TMP_PRICES.csv"

echo ""
echo -e "${GREEN}✨ 同期完了！${NC}"
