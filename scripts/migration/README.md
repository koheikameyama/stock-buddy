# データ移行スクリプト

このディレクトリには、データベーススキーマの変更に伴うデータ移行スクリプトが格納されています。

## migrate_to_userstock.py

PortfolioStock と Watchlist を新しい UserStock モデルに統合するマイグレーションスクリプト。

### 目的

既存の2つのモデル（PortfolioStock と Watchlist）を統合し、新しい UserStock モデルに移行します。

- **PortfolioStock** → UserStock (holding mode: quantity あり)
- **Watchlist** → UserStock (watch mode: quantity なし)

### 使い方

```bash
# 1. Dry-run モード（テスト実行 - コミットしない）
python scripts/migration/migrate_to_userstock.py --dry-run

# 2. 本番実行（要確認プロンプト）
python scripts/migration/migrate_to_userstock.py
```

### 実行前の確認事項

- [ ] `DATABASE_URL` 環境変数が設定されていること
- [ ] UserStock テーブルが作成されていること（マイグレーション適用済み）
- [ ] 必ず dry-run モードで動作確認すること
- [ ] 本番実行前にデータベースのバックアップを取ること

### マイグレーションロジック

#### 1. PortfolioStock → UserStock (優先度: 高)

```sql
INSERT INTO "UserStock" (
  id, userId, stockId, quantity, averagePrice, purchaseDate, createdAt, updatedAt
)
SELECT
  gen_new_cuid(),                -- 新しいID
  p.userId,                      -- Portfolio経由でuserIdを取得
  ps.stockId,
  ps.quantity,                   -- 保有数量
  ps.averagePrice,               -- 平均取得価格
  ps.createdAt,                  -- 購入日として使用
  ps.createdAt,
  NOW()
FROM "PortfolioStock" ps
JOIN "Portfolio" p ON ps.portfolioId = p.id
ON CONFLICT (userId, stockId) DO NOTHING
```

#### 2. Watchlist → UserStock (優先度: 低)

```sql
INSERT INTO "UserStock" (
  id, userId, stockId, quantity, averagePrice, purchaseDate, createdAt, updatedAt
)
SELECT
  gen_new_cuid(),                -- 新しいID
  w.userId,
  w.stockId,
  NULL,                          -- Watch mode: quantity なし
  NULL,                          -- Watch mode: averagePrice なし
  NULL,                          -- Watch mode: purchaseDate なし
  w.createdAt,
  NOW()
FROM "Watchlist" w
ON CONFLICT (userId, stockId) DO NOTHING  -- 重複時はスキップ
```

#### 3. 重複処理

同じユーザーが同じ銘柄を Portfolio と Watchlist 両方に持っている場合：

- **Portfolio データを優先** (holding data を保持)
- Watchlist エントリは自動的にスキップされる（`ON CONFLICT DO NOTHING`）

### 出力例

```
============================================================
🔍 DRY-RUN MODE (changes will NOT be committed)
============================================================

[2026-02-02 21:24:38] Starting migration...
============================================================
Fetching PortfolioStock data...
  ✓ Found 2 PortfolioStock records
Fetching Watchlist data...
  ✓ Found 1 Watchlist records
Preparing PortfolioStock migration data...
  ✓ Prepared 2 PortfolioStock records
Preparing Watchlist migration data...
  ✓ Prepared 1 Watchlist records

============================================================
Migrating to UserStock table...
============================================================

Inserting PortfolioStock data (holding mode)...
  Progress: 2/2 records...
  ✓ Inserted 2 PortfolioStock records

Inserting Watchlist data (watch mode)...
  ℹ️  Found 2 existing UserStock records
  ℹ️  Skipping 0 duplicate entries (Portfolio takes priority)
  ℹ️  Inserting 1 unique Watchlist entries
  Progress: 1/1 records...
  ✓ Inserted 1 Watchlist records

============================================================
Verifying migration...
============================================================
  Total UserStock records: 3
  Holding mode (quantity NOT NULL): 2
  Watch mode (quantity IS NULL): 1

  Top 10 users by UserStock count:
  --------------------------------------------------
  cmky609dy000... | Total:   3 | Holdings:   2 | Watch:   1

============================================================
🔍 DRY-RUN MODE: Rolling back changes...
✓ Rollback complete (no changes were saved)

============================================================
Migration Summary
============================================================
  PortfolioStock migrated: 2 records
  Watchlist migrated:      1 records
  Watchlist skipped:       0 records (duplicates)
  Total:                   3 records
============================================================
[2026-02-02 21:24:38] Migration complete!
```

### 特徴

- ✅ **N+1 問題の回避**: バッチ処理（100件ごと）を使用
- ✅ **トランザクション安全性**: エラー時は自動ロールバック
- ✅ **Dry-run モード**: 本番実行前にテスト可能
- ✅ **詳細なログ**: 進捗状況を逐次表示
- ✅ **重複処理**: Portfolio を優先、Watchlist は自動スキップ
- ✅ **検証機能**: マイグレーション後のデータを自動検証

### エラー処理

スクリプトはエラー発生時に自動的にロールバックします：

```python
try:
    # マイグレーション処理
    migrate_to_userstock(...)
    conn.commit()
except Exception as e:
    print(f"✗ Error: {e}")
    conn.rollback()
    raise e
```

### 本番環境での実行

```bash
# 1. 本番環境のデータベースURLを設定
export DATABASE_URL="postgresql://..."

# 2. Dry-runで動作確認
python scripts/migration/migrate_to_userstock.py --dry-run

# 3. 結果を確認後、本番実行
python scripts/migration/migrate_to_userstock.py

# 確認プロンプトが表示される
# Are you sure you want to proceed? (yes/no): yes
```

### 注意事項

- 本番環境では必ず **バックアップを取ってから実行** すること
- Dry-run モードで必ず動作確認すること
- 実行後は UserStock テーブルのデータを確認すること
- 旧テーブル（PortfolioStock, Watchlist）は **削除しないこと**（ロールバック用）
