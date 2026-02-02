# JPX Stock Scraper

JPX（日本取引所グループ）から新規上場・上場廃止銘柄をスクレイピングし、Stock マスタデータベースを自動更新するスクリプト群。

## スクリプト一覧

### 1. `scrape_stocks.py`

JPXの公式サイトから銘柄情報をスクレイピング。

**対象ページ:**
- 新規上場: https://www.jpx.co.jp/listing/stocks/new/index.html
- 上場廃止: https://www.jpx.co.jp/listing/stocks/delisted/index.html

**取得データ:**
- `ticker`: 銘柄コード（例: "9999.T"）
- `name`: 会社名
- `sector`: 業種
- `listedDate`: 上場日（ISO 8601形式）

**出力:**
- `scripts/jpx/jpx_stocks.json`

**実行方法:**
```bash
python scripts/jpx/scrape_stocks.py
```

### 2. `update_stock_master.py`

スクレイピングしたデータをPostgreSQLの`Stock`テーブルに反映。

**機能:**
- バッチUPSERT（N+1問題を回避）
- 既存銘柄は更新、新規銘柄は追加
- `tickerCode`をユニークキーとして使用

**実行方法:**
```bash
# 環境変数を設定
export PRODUCTION_DATABASE_URL="postgresql://user:pass@host:port/db"

# スクリプト実行
python scripts/jpx/update_stock_master.py
```

**ログ出力例:**
```
✅ Loaded 5 records from scripts/jpx/jpx_stocks.json
ℹ️  Upserting 5 stocks to database...
  ✓ Batch 1: 2 added, 3 updated
=============================================================
Database update completed:
  Added: 2
  Updated: 3
  Errors: 0
=============================================================
```

## セットアップ

### 依存ライブラリのインストール

```bash
pip install -r scripts/jpx/requirements.txt
```

または個別にインストール:
```bash
pip install beautifulsoup4==4.12.3 requests==2.31.0 psycopg2-binary==2.9.9
```

## 使用例

### 完全な実行フロー

```bash
# 1. JPXから銘柄をスクレイピング
python scripts/jpx/scrape_stocks.py

# 2. データベースを更新
export PRODUCTION_DATABASE_URL="postgresql://..."
python scripts/jpx/update_stock_master.py
```

### GitHub Actions で自動実行

```yaml
name: Update Stock Master

on:
  schedule:
    - cron: '0 10 * * 1'  # 毎週月曜 10:00 UTC

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: pip install -r scripts/jpx/requirements.txt
      - name: Scrape JPX data
        run: python scripts/jpx/scrape_stocks.py
      - name: Update database
        env:
          PRODUCTION_DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}
        run: python scripts/jpx/update_stock_master.py
```

## データベーススキーマ

```sql
CREATE TABLE "Stock" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "tickerCode" TEXT UNIQUE NOT NULL,
  "name" TEXT NOT NULL,
  "market" TEXT NOT NULL,
  "sector" TEXT,
  "listedDate" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW()
);
```

## エラーハンドリング

- **JPXのページ構造が変更された場合**: 空の配列を返し、警告を出力
- **ネットワークエラー**: リトライせず、エラーログを出力
- **データベースエラー**: トランザクションをロールバック
- **バリデーションエラー**: 該当レコードをスキップし、エラーカウント

## 注意事項

1. **JPXのページ構造**: 将来的に変更される可能性があります。定期的に動作確認が必要です。
2. **スクレイピング頻度**: JPXサーバーに負荷をかけないよう、実行頻度を制限してください（推奨: 週1回）。
3. **本番DB操作**: `update_stock_master.py`は本番DBを直接変更します。必ず`PRODUCTION_DATABASE_URL`を正しく設定してください。

## トラブルシューティング

### スクレイピングでデータが取得できない

```
⚠️  No data retrieved.
```

**原因:**
- JPXのページ構造が変更された
- ネットワークエラー
- 現在、新規上場・上場廃止銘柄がない

**対処法:**
1. ブラウザで対象URLを確認
2. HTMLテーブル構造を確認
3. スクリプトのセレクタを修正

### データベース接続エラー

```
❌ ERROR: PRODUCTION_DATABASE_URL environment variable is not set
```

**対処法:**
```bash
export PRODUCTION_DATABASE_URL="postgresql://user:pass@host:port/db"
```

## ライセンス

MIT
