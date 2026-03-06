# Transaction Snapshot 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 取引ごとにその時点の分析データ（スコア・ランク・トレンド・AIコメント）を自動保存し、銘柄詳細ページで「購入時 vs 今」の比較を表示する。

**Architecture:** TransactionSnapshot テーブルを新設し、Transaction と 1:1 で紐づける。日次バッチ（close セッション）で未処理の Transaction に対して最新の StockReport データからスナップショットを自動生成する。銘柄詳細ページに「取引時の状態」セクションを追加し、各取引のスナップショットと現在の分析データを並べて表示する。

**Tech Stack:** Prisma (PostgreSQL), Python (バッチ処理), Next.js (API Routes + React), next-intl (i18n)

**設計ドキュメント:** `docs/plans/2026-03-06-transaction-snapshot-design.md`

---

### Task 1: Prisma スキーマに TransactionSnapshot モデルを追加

**Files:**
- Modify: `prisma/schema.prisma:424-448` (Transaction モデルにリレーション追加)
- Modify: `prisma/schema.prisma` (末尾に TransactionSnapshot モデル追加)

**Step 1: Transaction モデルにリレーションを追加**

`prisma/schema.prisma` の Transaction モデル（L424-448）に `snapshot` リレーションを追加:

```prisma
model Transaction {
  id               String          @id @default(cuid())
  userId           String
  user             User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  stockId          String
  stock            Stock           @relation(fields: [stockId], references: [id], onDelete: Cascade)
  portfolioStockId String?
  portfolioStock   PortfolioStock? @relation(fields: [portfolioStockId], references: [id], onDelete: SetNull)

  // 取引情報
  type            String // "buy" | "sell"
  quantity        Int
  price           Decimal  @db.Decimal(12, 2)
  totalAmount     Decimal  @db.Decimal(15, 2)
  transactionDate DateTime

  // スナップショット（1:1）
  snapshot TransactionSnapshot?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([stockId])
  @@index([portfolioStockId])
  @@index([transactionDate(sort: Desc)])
  @@index([type])
}
```

**Step 2: TransactionSnapshot モデルを追加**

`prisma/schema.prisma` の末尾に追加:

```prisma
// 取引時スナップショット（取引時点の分析データを保存）
model TransactionSnapshot {
  id            String      @id @default(cuid())
  transactionId String      @unique
  transaction   Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)

  // 株価
  stockPrice Decimal @db.Decimal(12, 2)

  // 分析スコア
  technicalScore    Int?    // テクニカルスコア 0-100
  fundamentalScore  Int?    // ファンダメンタルスコア 0-100
  healthRank        String? // 健全性ランク A-E

  // トレンド方向
  shortTermTrend String? // up / neutral / down
  midTermTrend   String? // up / neutral / down
  longTermTrend  String? // up / neutral / down

  // 市場シグナル
  marketSignal String? // bullish / neutral / bearish

  // AI分析コメント要約
  analysisSummary String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([transactionId])
}
```

**Step 3: マイグレーション実行**

Run:
```bash
# ローカルDB確認
grep DATABASE_URL .env

# マイグレーション作成
npx prisma migrate dev --name add_transaction_snapshot
```

Expected: Migration created successfully, Prisma Client regenerated.

**Step 4: コミット**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: TransactionSnapshot モデル追加"
```

---

### Task 2: 定数追加（TypeScript + Python）

**Files:**
- Modify: `lib/constants.ts`
- Modify: `scripts/lib/constants.py`

**Step 1: TypeScript 定数追加**

`lib/constants.ts` に追加:

```typescript
// =============================================================================
// 取引スナップショット
// =============================================================================

export const TRANSACTION_SNAPSHOT = {
  /** 売却済み銘柄のスナップショット保持期間（日数） */
  SOLD_RETENTION_DAYS: 90,
} as const;
```

**Step 2: Python 定数追加**

`scripts/lib/constants.py` に追加:

```python
# =============================================================================
# 取引スナップショット
# =============================================================================

# 売却済み銘柄のスナップショット保持期間（日数）
# → TS: TRANSACTION_SNAPSHOT.SOLD_RETENTION_DAYS
TRANSACTION_SNAPSHOT_SOLD_RETENTION_DAYS = 90
```

**Step 3: コミット**

```bash
git add lib/constants.ts scripts/lib/constants.py
git commit -m "feat: TransactionSnapshot 定数追加"
```

---

### Task 3: スナップショット生成バッチスクリプト作成

**Files:**
- Create: `scripts/github-actions/generate_transaction_snapshots.py`

**Step 1: バッチスクリプト作成**

既存の `generate_portfolio_snapshots.py` のパターンに従い、以下の処理フローで作成:

1. スナップショット未作成の Transaction を取得
2. 対象 stockId の最新 StockReport を一括取得
3. 対象 stockId の最新株価を一括取得
4. TransactionSnapshot を一括 INSERT

```python
#!/usr/bin/env python3
"""
取引スナップショット生成スクリプト

取引登録後の初回分析バッチ完了時に、その時点の分析データ（StockReport）を
TransactionSnapshot として保存する。

実行タイミング: close セッション（15:40 JST）の stock-reports 完了後
"""

import os
import sys
from datetime import datetime
import psycopg2
import psycopg2.extras

# scriptsディレクトリをPythonパスに追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def fetch_transactions_without_snapshot(conn) -> list[dict]:
    """スナップショット未作成の取引を取得"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT t.id, t."stockId", t.price
            FROM "Transaction" t
            LEFT JOIN "TransactionSnapshot" ts ON ts."transactionId" = t.id
            WHERE ts.id IS NULL
        ''')
        rows = cur.fetchall()

    return [
        {"id": row[0], "stockId": row[1], "price": float(row[2])}
        for row in rows
    ]


def fetch_latest_stock_reports(conn, stock_ids: list[str]) -> dict:
    """対象銘柄の最新 StockReport を一括取得"""
    if not stock_ids:
        return {}

    with conn.cursor() as cur:
        # DISTINCT ON で各 stockId の最新レポートを1件ずつ取得
        cur.execute('''
            SELECT DISTINCT ON ("stockId")
                "stockId",
                "technicalScore",
                "fundamentalScore",
                "healthRank",
                "shortTermTrend",
                "midTermTrend",
                "longTermTrend",
                "marketSignal",
                "reason"
            FROM "StockReport"
            WHERE "stockId" = ANY(%s)
            ORDER BY "stockId", date DESC
        ''', (stock_ids,))
        rows = cur.fetchall()

    return {
        row[0]: {
            "technicalScore": row[1],
            "fundamentalScore": row[2],
            "healthRank": row[3],
            "shortTermTrend": row[4],
            "midTermTrend": row[5],
            "longTermTrend": row[6],
            "marketSignal": row[7],
            "reason": row[8],
        }
        for row in rows
    }


def fetch_latest_stock_prices(conn, stock_ids: list[str]) -> dict:
    """対象銘柄の最新株価を一括取得"""
    if not stock_ids:
        return {}

    with conn.cursor() as cur:
        cur.execute('''
            SELECT id, "latestPrice"
            FROM "Stock"
            WHERE id = ANY(%s) AND "latestPrice" IS NOT NULL
        ''', (stock_ids,))
        rows = cur.fetchall()

    return {row[0]: float(row[1]) for row in rows}


def create_snapshots(conn, transactions: list[dict], reports: dict, prices: dict) -> int:
    """TransactionSnapshot を一括作成"""
    values = []
    for tx in transactions:
        report = reports.get(tx["stockId"], {})
        stock_price = prices.get(tx["stockId"], tx["price"])

        values.append((
            tx["id"],
            stock_price,
            report.get("technicalScore"),
            report.get("fundamentalScore"),
            report.get("healthRank"),
            report.get("shortTermTrend"),
            report.get("midTermTrend"),
            report.get("longTermTrend"),
            report.get("marketSignal"),
            report.get("reason"),
        ))

    if not values:
        return 0

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            '''
            INSERT INTO "TransactionSnapshot" (
                "id", "transactionId", "stockPrice",
                "technicalScore", "fundamentalScore", "healthRank",
                "shortTermTrend", "midTermTrend", "longTermTrend",
                "marketSignal", "analysisSummary",
                "createdAt", "updatedAt"
            )
            VALUES %s
            ON CONFLICT ("transactionId") DO NOTHING
            ''',
            values,
            template='''(
                gen_random_uuid()::text, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s,
                NOW(), NOW()
            )''',
            page_size=100,
        )
    conn.commit()
    return len(values)


def main():
    print(f"Transaction Snapshot generation started at {datetime.now().isoformat()}")
    print("-" * 50)

    conn = psycopg2.connect(get_database_url())
    try:
        # 1. スナップショット未作成の取引を取得
        transactions = fetch_transactions_without_snapshot(conn)
        print(f"Transactions without snapshot: {len(transactions)}")

        if not transactions:
            print("No transactions to process. Done.")
            return

        # 2. 対象銘柄の stockId を収集
        stock_ids = list(set(tx["stockId"] for tx in transactions))
        print(f"Unique stocks: {len(stock_ids)}")

        # 3. 最新の StockReport と株価を一括取得
        reports = fetch_latest_stock_reports(conn, stock_ids)
        prices = fetch_latest_stock_prices(conn, stock_ids)
        print(f"Reports found: {len(reports)}, Prices found: {len(prices)}")

        # 4. スナップショット一括作成
        count = create_snapshots(conn, transactions, reports, prices)
        print(f"\nCreated {count} transaction snapshots")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        conn.close()

    print("Done!")


if __name__ == "__main__":
    main()
```

**Step 2: コミット**

```bash
git add scripts/github-actions/generate_transaction_snapshots.py
git commit -m "feat: 取引スナップショット生成バッチスクリプト追加"
```

---

### Task 4: GitHub Actions ワークフロー追加

**Files:**
- Create: `.github/workflows/session-transaction-snapshots.yml`
- Modify: `.github/workflows/session-batch.yml`

**Step 1: ワークフローファイル作成**

`session-portfolio-snapshots.yml` と同じパターンで作成:

```yaml
name: Transaction Snapshots

on:
  workflow_dispatch:
  workflow_call:

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install Python dependencies
        run: pip install psycopg2-binary

      - name: Generate transaction snapshots
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: python scripts/github-actions/generate_transaction_snapshots.py
```

**Step 2: session-batch.yml に統合**

`session-batch.yml` に追加（close セッションのみ、stock-reports 完了後）:

```yaml
  transaction-snapshots:
    needs: stock-reports
    if: "!failure() && !cancelled() && inputs.session == 'close'"
    uses: ./.github/workflows/session-transaction-snapshots.yml
    secrets: inherit
```

`session-batch.yml` の `notify` ジョブの `needs` リストに `transaction-snapshots` を追加:

```yaml
  notify:
    needs: [fetch-stock-prices, stock-reports, portfolio-analysis, daily-highlights, gainers-losers, portfolio-snapshots, transaction-snapshots, daily-market-navigator]
```

**Step 3: session-batch.yml のセッション説明コメントを更新**

L30 のコメントを更新:

```yaml
#   close (15:40):         prices → trends → レポート + PF分析 + 注目データ + gainers + snapshots + tx-snapshots → navigator(evening)
```

**Step 4: コミット**

```bash
git add .github/workflows/session-transaction-snapshots.yml .github/workflows/session-batch.yml
git commit -m "feat: 取引スナップショットをcloseセッションバッチに追加"
```

---

### Task 5: クリーンアップ処理追加

**Files:**
- Modify: `scripts/github-actions/cleanup_old_data.py`
- Modify: `scripts/lib/constants.py` (Task 2 で追加済み)

**Step 1: cleanup_old_data.py にスナップショット削除を追加**

`cleanup_old_data.py` のクリーンアップ処理に追加。全売却された銘柄の取引スナップショットを90日後に削除する。

既存の削除処理（`[7/7]` の前、L100 付近）に追加:

```python
            # 6. TransactionSnapshot（売却済み銘柄のスナップショット: 90日保持）
            # 全売却されたPortfolioStockに紐づくTransactionのスナップショットを削除
            snapshot_cutoff = get_days_ago_jst(TRANSACTION_SNAPSHOT_SOLD_RETENTION_DAYS)
            cur.execute('''
                SELECT COUNT(*) FROM "TransactionSnapshot" ts
                JOIN "Transaction" t ON ts."transactionId" = t.id
                WHERE t."portfolioStockId" IS NULL
                  AND t."createdAt" < %s
            ''', (snapshot_cutoff,))
            count = cur.fetchone()[0]
            print(f"\n[6/8] TransactionSnapshot (sold, 90+ days): {count} records to delete")
            if count > 0:
                cur.execute('''
                    DELETE FROM "TransactionSnapshot" ts
                    USING "Transaction" t
                    WHERE ts."transactionId" = t.id
                      AND t."portfolioStockId" IS NULL
                      AND t."createdAt" < %s
                ''', (snapshot_cutoff,))
                print(f"  Deleted: {cur.rowcount}")
                total_deleted += cur.rowcount
```

import 行に `TRANSACTION_SNAPSHOT_SOLD_RETENTION_DAYS` を追加:

```python
from lib.constants import RETENTION_DAYS, TRANSACTION_SNAPSHOT_SOLD_RETENTION_DAYS
```

VACUUM 処理に追加:

```python
                cur.execute('VACUUM ANALYZE "TransactionSnapshot"')
```

番号を `[1/8]` 〜 `[8/8]` に振り直す。

**Step 2: コミット**

```bash
git add scripts/github-actions/cleanup_old_data.py
git commit -m "feat: 売却済み取引スナップショットの90日クリーンアップ追加"
```

---

### Task 6: API レスポンスにスナップショットを含める

**Files:**
- Modify: `app/my-stocks/[id]/MyStockDetailClient.tsx:36-43` (Transaction interface 拡張)
- Modify: `app/api/user-stocks/[id]/route.ts` (レスポンスにスナップショット追加)
- Modify: `app/api/portfolio-stocks/[id]/additional-purchase/route.ts` (レスポンスにスナップショット追加)
- Modify: `lib/portfolio-stock-utils.ts` (buildPortfolioStockResponse に snapshot 追加)

**Step 1: Transaction の include に snapshot を追加**

API でポートフォリオデータを取得する際、`transactions` の `include` に `snapshot` を追加する。

`app/api/user-stocks/[id]/route.ts` 内の全ての `transactions` 取得箇所に `include: { snapshot: true }` を追加。

例（L79, L223, L309 付近）:

```typescript
transactions: {
  orderBy: { transactionDate: "asc" },
  include: { snapshot: true },
},
```

**Step 2: レスポンスの transactions にスナップショットを含める**

各 transaction の map 処理にスナップショットを追加。

`app/api/user-stocks/[id]/route.ts` の L341-348 付近:

```typescript
transactions: updated.transactions.map((t) => ({
  id: t.id,
  type: t.type,
  quantity: t.quantity,
  price: t.price.toNumber(),
  totalAmount: t.totalAmount.toNumber(),
  transactionDate: t.transactionDate.toISOString(),
  snapshot: t.snapshot
    ? {
        stockPrice: Number(t.snapshot.stockPrice),
        technicalScore: t.snapshot.technicalScore,
        fundamentalScore: t.snapshot.fundamentalScore,
        healthRank: t.snapshot.healthRank,
        shortTermTrend: t.snapshot.shortTermTrend,
        midTermTrend: t.snapshot.midTermTrend,
        longTermTrend: t.snapshot.longTermTrend,
        marketSignal: t.snapshot.marketSignal,
        analysisSummary: t.snapshot.analysisSummary,
      }
    : null,
})),
```

同様の変更を `app/api/portfolio-stocks/[id]/additional-purchase/route.ts` と `lib/portfolio-stock-utils.ts` の `buildPortfolioStockResponse` にも適用する。

**Step 3: フロントエンド Transaction interface 更新**

`app/my-stocks/[id]/MyStockDetailClient.tsx` L36-43:

```typescript
interface TransactionSnapshot {
  stockPrice: number;
  technicalScore: number | null;
  fundamentalScore: number | null;
  healthRank: string | null;
  shortTermTrend: string | null;
  midTermTrend: string | null;
  longTermTrend: string | null;
  marketSignal: string | null;
  analysisSummary: string | null;
}

interface Transaction {
  id: string;
  type: string;
  quantity: number;
  price: number;
  totalAmount: number;
  transactionDate: string;
  snapshot: TransactionSnapshot | null;
}
```

**Step 4: コミット**

```bash
git add app/api/user-stocks/[id]/route.ts app/api/portfolio-stocks/[id]/additional-purchase/route.ts lib/portfolio-stock-utils.ts app/my-stocks/[id]/MyStockDetailClient.tsx
git commit -m "feat: API レスポンスに取引スナップショットを含める"
```

---

### Task 7: i18n 翻訳追加

**Files:**
- Modify: `locales/ja/portfolio.json`

**Step 1: 翻訳キーを追加**

`locales/ja/portfolio.json` に追加:

```json
{
  "transactionSnapshot": {
    "title": "取引時の分析データ",
    "preparing": "分析データ準備中",
    "atTransaction": "取引時",
    "current": "現在",
    "price": "株価",
    "technicalScore": "テクニカル",
    "fundamentalScore": "ファンダメンタル",
    "healthRank": "健全性",
    "trend": "トレンド",
    "shortTerm": "短期",
    "midTerm": "中期",
    "longTerm": "長期",
    "aiAnalysis": "取引時のAI分析",
    "noChange": "変化なし",
    "buy": "購入",
    "sell": "売却"
  }
}
```

**Step 2: コミット**

```bash
git add locales/ja/portfolio.json
git commit -m "feat: 取引スナップショットの i18n 翻訳追加"
```

---

### Task 8: スナップショット表示コンポーネント作成

**Files:**
- Create: `app/components/TransactionSnapshotSection.tsx`

**Step 1: コンポーネント作成**

取引履歴セクションの上に「取引時の分析データ」セクションを表示するコンポーネント。各取引カードにスナップショットデータと現在の分析データの比較を表示する。

参照ファイル:
- `app/my-stocks/[id]/MyStockDetailClient.tsx:569-668` — 取引履歴セクションの表示パターン
- `app/components/StockReport.tsx` — スコア・ランク表示のパターン
- `locales/ja/stocks.json:22-32` — 健全性ランクのラベル

コンポーネントの Props:

```typescript
interface TransactionSnapshotSectionProps {
  transactions: Transaction[];
  currentReport: {
    technicalScore: number | null;
    fundamentalScore: number | null;
    healthRank: string | null;
    shortTermTrend: string | null;
    midTermTrend: string | null;
    longTermTrend: string | null;
    marketSignal: string | null;
  } | null;
  currentPrice: number | null;
}
```

表示ルール:
- スナップショットを持つ取引のみ表示（snapshot が null の取引は「分析データ準備中」）
- 新しい取引順にソート
- 株価・スコアの変化をカラーコード（プラス=緑、マイナス=赤）
- トレンドは矢印アイコン（↑ / → / ↓）で表示
- AI分析コメントは折りたたみ可能

**Step 2: コミット**

```bash
git add app/components/TransactionSnapshotSection.tsx
git commit -m "feat: TransactionSnapshotSection コンポーネント追加"
```

---

### Task 9: 銘柄詳細ページに統合

**Files:**
- Modify: `app/my-stocks/[id]/MyStockDetailClient.tsx`

**Step 1: コンポーネントをインポート**

```typescript
import TransactionSnapshotSection from "@/app/components/TransactionSnapshotSection";
```

**Step 2: 取引履歴セクション（L569）の直前に配置**

スナップショットを持つ取引がある場合のみ表示:

```tsx
{/* Transaction Snapshot Section - Before transaction history */}
{stock.transactions && stock.transactions.some((t) => t.snapshot) && (
  <TransactionSnapshotSection
    transactions={stock.transactions}
    currentReport={/* 現在のレポートデータ */}
    currentPrice={currentPrice}
  />
)}
```

現在の分析データは既にページ内で取得されている StockReport から渡す。

**Step 3: コミット**

```bash
git add app/my-stocks/[id]/MyStockDetailClient.tsx
git commit -m "feat: 銘柄詳細ページに取引スナップショットセクション追加"
```

---

### Task 10: 仕様書更新

**Files:**
- Modify: `docs/specs/my-stocks.md`
- Modify: `docs/specs/stock-detail.md`
- Modify: `docs/specs/batch-processing.md`

**Step 1: my-stocks.md にデータモデル追加**

TransactionSnapshot モデルの説明を追加。

**Step 2: stock-detail.md に表示セクション追加**

銘柄詳細ページの「取引時の分析データ」セクションの説明を追加。

**Step 3: batch-processing.md にバッチジョブ追加**

close セッションの処理一覧に `transaction-snapshots` を追加。

**Step 4: コミット**

```bash
git add docs/specs/my-stocks.md docs/specs/stock-detail.md docs/specs/batch-processing.md
git commit -m "docs: 取引スナップショットの仕様書更新"
```
