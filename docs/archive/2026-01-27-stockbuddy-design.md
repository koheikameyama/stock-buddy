# Stock Buddy 設計書（最終版）

## 作成日
2026-01-27

## 概要
Stock Buddyは、株式投資初心者向けのAI投資アシスタントサービス。
**「任せて学んで、一緒に増やす」**をコンセプトに、AIに判断を任せながら理由を理解できる投資を提供する。

---

## 技術スタック（最終版）

### アプリケーション
- **Next.js 14** (App Router)
- **TypeScript**
- **TailwindCSS**
- **NextAuth.js** (Google OAuth)
- **Prisma** (ORM)
- **OpenAI API** (GPT-4 - レポート生成)
- **technicalindicators** (npm - 技術指標計算)

### Cronスクリプト
- **Python 3.11+**
- **yfinance** (株価データ取得)
- **psycopg2** (PostgreSQL接続)

### データベース
- **PostgreSQL** (Railway提供)

### インフラ
- **Railway**
  - Next.jsサービス
  - PostgreSQLサービス
  - Cron Job（毎日17:00 JST）

---

## システムアーキテクチャ

```
┌─────────────────────────────────────────┐
│          Railway Project                │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  Next.js Service (Port 3000)      │  │
│  │                                   │  │
│  │  [フロントエンド]                  │  │
│  │  - React コンポーネント            │  │
│  │  - TailwindCSS                    │  │
│  │                                   │  │
│  │  [バックエンド: API Routes]        │  │
│  │  - /api/stocks/*                  │  │
│  │  - /api/portfolios/*              │  │
│  │  - /api/reports/*                 │  │
│  │  - NextAuth.js (Google OAuth)     │  │
│  │  - OpenAI API 呼び出し             │  │
│  │  - Prisma ORM                     │  │
│  └───────────┬───────────────────────┘  │
│              │                          │
│  ┌───────────▼───────────────────────┐  │
│  │  PostgreSQL Service               │  │
│  │  - ユーザーデータ                  │  │
│  │  - 株価データ                      │  │
│  │  - レポート履歴                    │  │
│  └───────────▲───────────────────────┘  │
│              │                          │
│  ┌───────────┴───────────────────────┐  │
│  │  Cron Job (毎日17:00 JST)         │  │
│  │  - Python スクリプト実行           │  │
│  │  - yfinance で株価取得             │  │
│  │  - PostgreSQL に直接書き込み       │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘

外部API: OpenAI GPT-4
```

### データフロー
1. **毎日17:00**: CronがPythonスクリプト実行
2. **Pythonスクリプト**: yfinanceで株価・指標データ取得 → PostgreSQLに保存
3. **ユーザーアクセス**: Next.jsページ表示
4. **API Routes**: DBから最新データ取得 → OpenAI APIでレポート生成
5. **Next.js**: レポート表示

### 設計の変更理由
- 当初FastAPI + Next.jsの2サーバー構成を検討
- yfinanceの用途が限定的（Cronのみ）であることが判明
- 技術指標計算もJavaScript（technicalindicators）で十分可能
- Next.js API Routesで全バックエンドロジックを統合することで大幅にシンプル化

---

## プロジェクト構成

```
stock-buddy/
│
├─ app/                          # Next.js App Router
│  ├─ (auth)/
│  │  ├─ login/
│  │  └─ onboarding/
│  │     ├─ page.tsx
│  │     └─ components/
│  ├─ dashboard/
│  │  └─ page.tsx
│  ├─ portfolio/
│  ├─ history/
│  ├─ api/                       # API Routes
│  │  ├─ auth/[...nextauth]/     # NextAuth
│  │  │  └─ route.ts
│  │  ├─ stocks/
│  │  │  ├─ route.ts
│  │  │  ├─ search/route.ts
│  │  │  └─ [ticker]/
│  │  │     ├─ route.ts
│  │  │     └─ prices/route.ts
│  │  ├─ portfolios/
│  │  │  ├─ route.ts
│  │  │  └─ [id]/
│  │  ├─ reports/
│  │  │  └─ daily/[portfolioId]/route.ts
│  │  ├─ transactions/
│  │  │  └─ route.ts
│  │  └─ onboarding/
│  │     └─ recommend/route.ts
│  └─ page.tsx                   # LP
│
├─ components/
│  ├─ ui/                        # shadcn/ui components
│  ├─ dashboard/
│  │  ├─ DailyReport.tsx
│  │  └─ PortfolioSummary.tsx
│  └─ onboarding/
│     ├─ InvestmentTypeSelector.tsx
│     ├─ BudgetForm.tsx
│     └─ StockRecommendation.tsx
│
├─ lib/
│  ├─ prisma.ts                  # Prisma client
│  ├─ auth.ts                    # NextAuth config
│  ├─ openai.ts                  # OpenAI client
│  └─ indicators.ts              # 技術指標計算
│
├─ prisma/
│  ├─ schema.prisma              # DB schema
│  └─ migrations/
│
├─ scripts/                      # Python スクリプト
│  ├─ fetch_stocks.py            # Cronで実行
│  ├─ init_data.py               # 初期データ投入
│  └─ requirements.txt
│
├─ docs/
│  ├─ specification.md
│  └─ plans/
│     └─ 2026-01-27-stockbuddy-design.md
│
├─ package.json
├─ tsconfig.json
├─ tailwind.config.ts
├─ next.config.js
└─ README.md
```

---

## データベース設計（Prisma Schema）

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// NextAuth.js 認証
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model User {
  id            String          @id @default(cuid())
  name          String?
  email         String?         @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
  portfolio     Portfolio?
  settings      UserSettings?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// ユーザー設定
model UserSettings {
  id                 String   @id @default(cuid())
  userId             String   @unique
  user               User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  investmentAmount   Int
  investmentPeriod   String   // 'short' | 'medium' | 'long'
  riskTolerance      String   // 'low' | 'medium' | 'high'
  isExistingInvestor Boolean  @default(false)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

// 銘柄マスタ
model Stock {
  id                String             @id @default(cuid())
  tickerCode        String             @unique
  name              String
  market            String
  sector            String?
  prices            StockPrice[]
  indicators        StockIndicator[]
  portfolioStocks   PortfolioStock[]
  transactions      Transaction[]
  dailyReports      DailyReport[]
  createdAt         DateTime           @default(now())

  @@index([tickerCode])
}

// 日次株価データ
model StockPrice {
  id            String   @id @default(cuid())
  stockId       String
  stock         Stock    @relation(fields: [stockId], references: [id], onDelete: Cascade)
  date          DateTime @db.Date
  open          Decimal  @db.Decimal(12, 2)
  high          Decimal  @db.Decimal(12, 2)
  low           Decimal  @db.Decimal(12, 2)
  close         Decimal  @db.Decimal(12, 2)
  volume        BigInt
  adjustedClose Decimal? @db.Decimal(12, 2)
  createdAt     DateTime @default(now())

  @@unique([stockId, date])
  @@index([stockId, date(sort: Desc)])
}

// 技術指標データ
model StockIndicator {
  id      String   @id @default(cuid())
  stockId String
  stock   Stock    @relation(fields: [stockId], references: [id], onDelete: Cascade)
  date    DateTime @db.Date
  sma25   Decimal? @db.Decimal(12, 2)
  sma75   Decimal? @db.Decimal(12, 2)
  rsi14   Decimal? @db.Decimal(5, 2)
  macd    Decimal? @db.Decimal(12, 4)
  signal  Decimal? @db.Decimal(12, 4)
  createdAt DateTime @default(now())

  @@unique([stockId, date])
  @@index([stockId, date(sort: Desc)])
}

// ポートフォリオ
model Portfolio {
  id             String           @id @default(cuid())
  userId         String           @unique
  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  name           String           @default("マイポートフォリオ")
  isActive       Boolean          @default(true)
  stocks         PortfolioStock[]
  transactions   Transaction[]
  dailyReports   DailyReport[]
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
}

// 保有銘柄
model PortfolioStock {
  id           String    @id @default(cuid())
  portfolioId  String
  portfolio    Portfolio @relation(fields: [portfolioId], references: [id], onDelete: Cascade)
  stockId      String
  stock        Stock     @relation(fields: [stockId], references: [id], onDelete: Cascade)
  quantity     Int
  averagePrice Decimal   @db.Decimal(12, 2)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@unique([portfolioId, stockId])
  @@index([portfolioId])
}

// 売買履歴
model Transaction {
  id          String    @id @default(cuid())
  portfolioId String
  portfolio   Portfolio @relation(fields: [portfolioId], references: [id], onDelete: Cascade)
  stockId     String
  stock       Stock     @relation(fields: [stockId], references: [id], onDelete: Cascade)
  type        String    // 'buy' | 'sell'
  quantity    Int
  price       Decimal   @db.Decimal(12, 2)
  totalAmount Decimal   @db.Decimal(12, 2)
  executedAt  DateTime
  note        String?
  createdAt   DateTime  @default(now())

  @@index([portfolioId, executedAt(sort: Desc)])
  @@index([stockId, executedAt(sort: Desc)])
}

// 毎日のBuddyレポート
model DailyReport {
  id                String    @id @default(cuid())
  portfolioId       String
  portfolio         Portfolio @relation(fields: [portfolioId], references: [id], onDelete: Cascade)
  reportDate        DateTime  @db.Date
  action            String    // 'buy' | 'sell' | 'hold'
  targetStockId     String?
  targetStock       Stock?    @relation(fields: [targetStockId], references: [id])
  suggestedQuantity Int?
  suggestedPrice    Decimal?  @db.Decimal(12, 2)
  summary           String    @db.Text
  reasoning         String    @db.Text
  futurePlan        String?   @db.Text
  keyIndicators     Json?
  generatedAt       DateTime  @default(now())
  createdAt         DateTime  @default(now())

  @@unique([portfolioId, reportDate])
  @@index([portfolioId, reportDate(sort: Desc)])
  @@index([targetStockId, reportDate(sort: Desc)])
}

// 指標解説マスタ
model IndicatorExplanation {
  id                   String   @id @default(cuid())
  indicatorName        String   @unique
  shortDescription     String
  detailedExplanation  String?  @db.Text
  exampleUsage         String?  @db.Text
  createdAt            DateTime @default(now())
}
```

---

## 画面設計

### 1. LP（ランディングページ）
- ヒーロー + キャッチコピー: 「AIに任せて、毎日ちょっと分かる投資」
- 特徴説明（3カラム）
  - 判断はAIに任せられる
  - 毎日少しずつ理解できる
  - シンプルで続けやすい
- 使い方の流れ（3ステップ）
- CTA: 「無料で始める」→ ログイン

### 2. ログイン
- NextAuth.js (Google OAuth)
- シンプルなログイン画面

### 3. オンボーディング

#### 3-1. 投資状況選択
```
┌─────────────────────────────────┐
│  あなたの投資状況を教えてください   │
├─────────────────────────────────┤
│  ○ これから投資を始める           │
│  ○ すでに投資をしている           │
│                                 │
│          [次へ]                 │
└─────────────────────────────────┘
```

#### 3-2-A. これから始める（AI銘柄提案）
```
投資プラン設定画面
- 投資予算選択
- 投資期間選択（短期/中長期）
- リスク許容度選択（低/中/高）
  ↓
AI銘柄提案画面
- 提案銘柄一覧（銘柄名、株数、予算、理由）
- [このポートフォリオで始める]
```

#### 3-2-B. すでに投資している（手動入力）
```
保有銘柄登録画面
- 銘柄検索（コードor名前）
- 株数・平均取得単価入力
- [+ 銘柄を追加]
- [登録完了]
```

### 4. ダッシュボード（メイン画面）

```
┌───────────────────────────────────────┐
│  Stock Buddy              [設定] [👤] │
├───────────────────────────────────────┤
│  📅 2026/01/27 のレポート             │
│                                       │
│  🔔 今日の結論                         │
│  ┌─────────────────────────────────┐ │
│  │  トヨタ自動車を 50株 売却推奨       │ │
│  │  価格: 2,800円                    │ │
│  └─────────────────────────────────┘ │
│                                       │
│  📊 今日の状況                         │
│  株価が上昇トレンドから反転の兆しが     │
│  見えています。利益確定のタイミング     │
│  として良い状態です。                  │
│                                       │
│  🔍 見ている指標                       │
│  ・25日移動平均: 2,750円 [?]          │
│  ・RSI: 72 (買われすぎ) [?]           │
│                                       │
│  📝 今後の方針                         │
│  RSIが70を超えているため、一旦       │
│  利益確定。再度60以下になったら       │
│  買い戻し検討。                       │
│                                       │
│  [この提案を実行する]                  │
│  [過去のレポートを見る]                │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│  💼 ポートフォリオ                     │
├───────────────────────────────────────┤
│  トヨタ自動車    100株   +5,000円     │
│  三菱UFJ      1000株   +2,000円     │
│                                       │
│  合計損益: +7,000円 (+2.3%)           │
└───────────────────────────────────────┘
```

### 5. その他画面
- ポートフォリオ詳細
- 取引履歴
- 過去のレポート一覧（カレンダービュー）
- 設定

---

## ユーザーフロー

### 初心者（これから投資を始める）
```
LP → ログイン → 投資状況選択
  → 予算・スタイル入力
  → AI銘柄提案
  → ポートフォリオ作成
  → ダッシュボード（毎日のレポート）
```

### 既存投資家
```
LP → ログイン → 投資状況選択
  → 保有銘柄入力
  → ポートフォリオ作成
  → ダッシュボード（毎日のレポート）
```

---

## API設計（Next.js API Routes）

### 認証不要
- `GET /api/health` - ヘルスチェック

### 認証必要

#### 銘柄
- `GET /api/stocks` - 銘柄一覧
- `GET /api/stocks/search?q={query}` - 銘柄検索
- `GET /api/stocks/[ticker]` - 銘柄詳細
- `GET /api/stocks/[ticker]/prices?from={date}&to={date}` - 株価データ

#### オンボーディング
- `POST /api/onboarding/recommend` - AI銘柄提案
  - Body: `{investmentAmount, investmentPeriod, riskTolerance}`
  - Response: `{suggestedStocks: [{ticker, name, quantity, price, reasoning}]}`

#### ポートフォリオ
- `POST /api/portfolios` - ポートフォリオ作成
- `GET /api/portfolios/[id]` - ポートフォリオ詳細
- `GET /api/portfolios/[id]/performance` - 損益計算
- `POST /api/portfolios/[id]/stocks` - 銘柄追加
- `DELETE /api/portfolios/[id]/stocks/[stockId]` - 銘柄削除

#### レポート
- `GET /api/reports/daily/[portfolioId]?date={YYYY-MM-DD}` - 日次レポート取得
- `GET /api/reports/history/[portfolioId]` - レポート履歴

#### 取引
- `POST /api/transactions` - 売買実行
  - Body: `{portfolioId, stockId, type, quantity, price}`
- `GET /api/transactions/[portfolioId]` - 取引履歴

---

## 技術指標計算（JavaScript）

```typescript
// lib/indicators.ts
import { SMA, RSI, MACD } from 'technicalindicators';

export interface IndicatorResult {
  sma25: number[];
  sma75: number[];
  rsi14: number[];
  macd: {
    MACD: number[];
    signal: number[];
    histogram: number[];
  }[];
}

export function calculateIndicators(closePrices: number[]): IndicatorResult {
  return {
    sma25: SMA.calculate({ period: 25, values: closePrices }),
    sma75: SMA.calculate({ period: 75, values: closePrices }),
    rsi14: RSI.calculate({ period: 14, values: closePrices }),
    macd: MACD.calculate({
      values: closePrices,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    })
  };
}
```

**npmライブラリ:**
- `technicalindicators` - 50種類以上の指標対応
- TypeScript完全対応
- 軽量・高速

---

## Cronスクリプト（Python）

### 株価取得スクリプト

```python
# scripts/fetch_stocks.py
import yfinance as yf
import psycopg2
from datetime import datetime, timedelta
import os
import sys

DATABASE_URL = os.getenv("DATABASE_URL")

def fetch_and_store():
    """
    1. DBから監視銘柄を取得
    2. yfinanceで株価データ取得
    3. PostgreSQLに保存
    """
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        # 監視銘柄を取得
        cur.execute('SELECT DISTINCT "tickerCode" FROM "Stock"')
        tickers = [row[0] for row in cur.fetchall()]

        print(f"Fetching data for {len(tickers)} stocks...")

        for ticker in tickers:
            try:
                print(f"Processing {ticker}...")
                stock = yf.Ticker(ticker)

                # 過去90日分取得（指標計算用に余裕を持たせる）
                hist = stock.history(period="90d")

                if hist.empty:
                    print(f"No data for {ticker}")
                    continue

                # stock_id取得
                cur.execute('SELECT id FROM "Stock" WHERE "tickerCode" = %s', (ticker,))
                stock_id = cur.fetchone()[0]

                # 最新データをINSERT（重複は無視）
                for date, row in hist.iterrows():
                    cur.execute("""
                        INSERT INTO "StockPrice"
                        ("stockId", date, open, high, low, close, volume, "adjustedClose", "createdAt")
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                        ON CONFLICT ("stockId", date) DO NOTHING
                    """, (
                        stock_id,
                        date.date(),
                        float(row['Open']),
                        float(row['High']),
                        float(row['Low']),
                        float(row['Close']),
                        int(row['Volume']),
                        float(row['Close'])  # adjustedClose
                    ))

                conn.commit()
                print(f"✓ {ticker} completed")

            except Exception as e:
                print(f"✗ Error processing {ticker}: {e}")
                conn.rollback()
                continue

        cur.close()
        conn.close()
        print("All done!")

    except Exception as e:
        print(f"Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    fetch_and_store()
```

### 初期データ投入スクリプト

```python
# scripts/init_data.py
import yfinance as yf
import psycopg2
import os

DATABASE_URL = os.getenv("DATABASE_URL")

# 主要銘柄（例: 日経225の主要株）
MAJOR_STOCKS = [
    ("7203.T", "トヨタ自動車", "TSE", "輸送用機器"),
    ("9984.T", "ソフトバンクグループ", "TSE", "情報・通信業"),
    ("6758.T", "ソニーグループ", "TSE", "電気機器"),
    ("9433.T", "KDDI", "TSE", "情報・通信業"),
    ("8306.T", "三菱UFJフィナンシャル・グループ", "TSE", "銀行業"),
    # ... 追加
]

def init_stocks():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    for ticker, name, market, sector in MAJOR_STOCKS:
        print(f"Initializing {ticker} - {name}...")

        # 銘柄マスタ登録
        cur.execute("""
            INSERT INTO "Stock" ("tickerCode", name, market, sector, "createdAt")
            VALUES (%s, %s, %s, %s, NOW())
            ON CONFLICT ("tickerCode") DO NOTHING
        """, (ticker, name, market, sector))

        # 過去2年分の株価データ取得
        stock = yf.Ticker(ticker)
        hist = stock.history(period="2y")

        cur.execute('SELECT id FROM "Stock" WHERE "tickerCode" = %s', (ticker,))
        stock_id = cur.fetchone()[0]

        for date, row in hist.iterrows():
            cur.execute("""
                INSERT INTO "StockPrice"
                ("stockId", date, open, high, low, close, volume, "adjustedClose", "createdAt")
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT ("stockId", date) DO NOTHING
            """, (
                stock_id,
                date.date(),
                float(row['Open']),
                float(row['High']),
                float(row['Low']),
                float(row['Close']),
                int(row['Volume']),
                float(row['Close'])
            ))

        conn.commit()
        print(f"✓ {ticker} initialized with 2 years of data")

    cur.close()
    conn.close()
    print("Initialization complete!")

if __name__ == "__main__":
    init_stocks()
```

### requirements.txt

```
yfinance==0.2.37
psycopg2-binary==2.9.9
```

---

## Railway設定

### Cron Job設定

Railway Dashboard → Cron → New Cron

```bash
# スケジュール（毎日17:00 JST = 08:00 UTC）
0 8 * * *

# コマンド
cd /app && python scripts/fetch_stocks.py
```

### 環境変数

```env
DATABASE_URL=postgresql://...
NEXTAUTH_URL=https://your-app.railway.app
NEXTAUTH_SECRET=your-secret-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
OPENAI_API_KEY=sk-...
```

---

## OpenAI プロンプト設計

### レポート生成プロンプト（例）

```typescript
// lib/openai.ts
export async function generateDailyReport(data: {
  stock: { name: string; ticker: string };
  currentPrice: number;
  quantity: number;
  averagePrice: number;
  indicators: {
    sma25: number;
    sma75: number;
    rsi14: number;
    macd: number;
  };
}) {
  const prompt = `
あなたは株式投資初心者向けのAIアシスタント「Stock Buddy」です。
以下のデータを元に、今日の投資判断レポートを生成してください。

# 制約
- 初心者にも分かりやすい言葉で説明
- 専門用語は必ず説明を添える
- 煽らない、断定的すぎない表現
- 判断理由を明確に
- 不確実性を認める（「〜の可能性があります」等）

# データ
- 銘柄: ${data.stock.name} (${data.stock.ticker})
- 現在価格: ${data.currentPrice}円
- 保有数: ${data.quantity}株
- 平均取得単価: ${data.averagePrice}円
- 25日移動平均: ${data.indicators.sma25}円
- 75日移動平均: ${data.indicators.sma75}円
- RSI(14): ${data.indicators.rsi14}
- MACD: ${data.indicators.macd}

# 出力形式（JSON）
必ず以下のJSON形式で出力してください。
{
  "action": "buy" | "sell" | "hold",
  "suggestedQuantity": number,
  "suggestedPrice": number,
  "summary": "今日の状況を初心者向けに2-3文で説明",
  "reasoning": "なぜこの判断をしたか。見ている指標とその意味を含めて3-4文で説明",
  "futurePlan": "今後どうなったらどうするか。2-3文で説明",
  "keyIndicators": [
    {
      "name": "25日移動平均",
      "value": ${data.indicators.sma25},
      "description": "短期的な株価の流れを示す線。現在価格より上なら上昇傾向"
    },
    {
      "name": "RSI",
      "value": ${data.indicators.rsi14},
      "description": "買われすぎ・売られすぎを示す数字。70以上は買われすぎ、30以下は売られすぎ"
    }
  ]
}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    response_format: { type: "json_object" }
  });

  return JSON.parse(response.choices[0].message.content);
}
```

---

## 実装計画（フェーズ分け）

### Phase 0: プロジェクト初期化（1-2日）
- Next.js 14プロジェクト作成
- Prisma セットアップ
- PostgreSQL接続（Railway）
- TailwindCSS セットアップ
- 基本的なディレクトリ構成作成

### Phase 1: 認証（1-2日）
- NextAuth.js セットアップ
- Google OAuth設定
- ログイン・ログアウトUI
- 認証middleware

### Phase 2: データ基盤（2-3日）
- Prisma schema定義
- マイグレーション実行
- Pythonスクリプト作成（fetch_stocks.py, init_data.py）
- 初期データ投入（主要銘柄）
- Railway Cron設定

### Phase 3: 銘柄検索・表示（1-2日）
- `/api/stocks` 実装
- `/api/stocks/search` 実装
- 銘柄検索UI
- technicalindicators統合

### Phase 4: オンボーディング（3-4日）
- 投資状況選択画面
- パターンA: 予算・スタイル入力フォーム
- パターンB: 保有銘柄入力フォーム
- `/api/onboarding/recommend` 実装（OpenAI統合）
- AI銘柄提案UI
- `/api/portfolios` 実装

### Phase 5: 毎日のBuddyレポート（4-5日）
- OpenAI API統合（本格実装）
- レポート生成ロジック
- `/api/reports/daily/[portfolioId]` 実装
- ダッシュボード画面
- 指標説明モーダル
- レポート履歴機能

### Phase 6: ポートフォリオ管理（2-3日）
- `/api/transactions` 実装
- 売買実行UI
- ポートフォリオ詳細画面
- 損益計算ロジック
- 取引履歴表示

### Phase 7: LP + 最終調整（2日）
- ランディングページ作成
- デザイン調整
- レスポンシブ対応

### Phase 8: デプロイ・運用（1-2日）
- Railway本番環境設定
- 環境変数設定
- Cron動作確認
- E2Eテスト

**総開発期間: 3-4週間**

---

## 技術的考慮事項

### セキュリティ
- NextAuth.js のセッション管理
- API Routes の認証チェック
- 環境変数の適切な管理
- Prismaによるパラメータ化クエリ（SQL injection対策）

### パフォーマンス
- 株価データのキャッシュ（日次更新のみ）
- レポート生成結果のキャッシュ（1日1回生成）
- Prismaのインデックス最適化
- Next.js の ISR (Incremental Static Regeneration) 活用

### エラーハンドリング
- yfinance API失敗時のリトライ
- OpenAI API失敗時のフォールバック（過去のレポート表示）
- ユーザー向けエラーメッセージ（初心者にも分かりやすく）

### モニタリング
- Railway ログ監視
- Cron実行ログ
- OpenAI API使用量監視（コスト管理）

### データ保持ポリシー
- 株価データ: 全データ永久保存
- レポート履歴: 全データ永久保存
- トランザクションログ: 全データ永久保存
- ストレージコストは低く、将来的な分析に有用

---

## 将来の拡張案

- 米国株対応
- デイトレードモード
- テーマ別ポートフォリオ
- 証券API連携（自動売買）
- Stock Buddy Pro（有料プラン）
  - 複数ポートフォリオ
  - 詳細レポート
  - リアルタイム分析
- モバイルアプリ（React Native）
- LINE Bot統合
- Slack Bot統合

---

## 参考資料

- 仕様書: `docs/specification.md`
- yfinance: https://github.com/ranaroussi/yfinance
- NextAuth.js: https://next-auth.js.org/
- Prisma: https://www.prisma.io/
- technicalindicators: https://www.npmjs.com/package/technicalindicators
- Railway: https://railway.app/
- OpenAI API: https://platform.openai.com/docs/

---

## まとめ

Stock Buddyは、Next.js単一構成により開発・運用がシンプルな設計。
yfinanceはCronスクリプトに限定し、技術指標計算はJavaScriptライブラリで実現。
個人開発で3-4週間での実装を目指す、実現可能性の高い設計。
