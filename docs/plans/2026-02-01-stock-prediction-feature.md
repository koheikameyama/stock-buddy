# 銘柄動向予測機能の設計

## 概要

マイ銘柄の各銘柄に対して、AIによる動向予測とアドバイスを表示する機能。

### 目的

- ユーザーが「今後どうなるか」を簡単に知れる
- 初心者でも理解しやすいシンプルな表示
- 毎日更新で常に最新の予測を提供

### 方針

- **表示**: シンプル（短期・中期・長期の3段階）
- **技術**: ルールベース + AI（ハイブリッド方式）
- **更新頻度**: 毎日（GitHub Actions で自動実行）
- **コスト**: gpt-4o-mini で月額 $1-2 程度

## UI設計

### マイ銘柄の表示

```
┌─────────────────────────────────────────┐
│ 【トヨタ自動車 (7203)】                 │
│ 2,500円 ▲50円 (+2.0%)                   │
├─────────────────────────────────────────┤
│                                         │
│ 📊 保有状況                             │
│ ├─ 保有数: 100株                        │
│ ├─ 平均取得単価: 2,450円                │
│ └─ 損益: +5,000円 (+2.0%)               │
│                                         │
│ 🔮 今後の予測                           │
│ ├─ 短期（1週間）: 📈 上昇傾向          │
│ │   予想 2,520円〜2,580円               │
│ ├─ 中期（1ヶ月）: 📊 横ばい            │
│ │   予想 2,450円〜2,600円               │
│ └─ 長期（3ヶ月）: 📈 緩やかな上昇      │
│     予想 2,600円〜2,800円               │
│                                         │
│ 💡 AIアドバイス                         │
│ 「現在は保有継続がおすすめです。        │
│  業績が安定しており、今後も成長が      │
│  期待できます。」                       │
│                                         │
│ 📅 予測更新: 2024/02/01 7:00            │
│                                         │
│ [詳しく見る] [アラート設定]             │
└─────────────────────────────────────────┘
```

### 購入記録なしの銘柄

```
┌─────────────────────────────────────────┐
│ 【ソニーG (6758)】                      │
│ 12,000円 ▼200円 (-1.6%)                 │
├─────────────────────────────────────────┤
│                                         │
│ 📊 購入記録なし                         │
│                                         │
│ 🔮 今後の予測                           │
│ ├─ 短期（1週間）: 📉 下降傾向          │
│ │   予想 11,500円〜11,800円             │
│ ├─ 中期（1ヶ月）: 📊 横ばい            │
│ │   予想 11,400円〜12,200円             │
│ └─ 長期（3ヶ月）: 📈 上昇              │
│     予想 12,500円〜13,500円             │
│                                         │
│ 💡 AIアドバイス                         │
│ 「短期的に下がる可能性があります。      │
│  11,500円まで下がったら買い時かも      │
│  しれません。」                         │
│                                         │
│ 📅 予測更新: 2024/02/01 7:00            │
│                                         │
│ [購入記録を追加] [アラート設定]         │
└─────────────────────────────────────────┘
```

### トレンドの表示アイコン

```typescript
const trendIcons = {
  up: '📈',
  neutral: '📊',
  down: '📉',
}

const trendLabels = {
  up: '上昇傾向',
  neutral: '横ばい',
  down: '下降傾向',
}
```

## データモデル

### StockAnalysis テーブル

```prisma
// 銘柄ごとのAI分析・予測
model StockAnalysis {
  id              String    @id @default(cuid())
  stockId         String
  stock           Stock     @relation(fields: [stockId], references: [id], onDelete: Cascade)

  // 短期予測（1週間）
  shortTermTrend      String    // 'up' | 'neutral' | 'down'
  shortTermPriceLow   Decimal   @db.Decimal(12, 2)
  shortTermPriceHigh  Decimal   @db.Decimal(12, 2)

  // 中期予測（1ヶ月）
  midTermTrend        String    // 'up' | 'neutral' | 'down'
  midTermPriceLow     Decimal   @db.Decimal(12, 2)
  midTermPriceHigh    Decimal   @db.Decimal(12, 2)

  // 長期予測（3ヶ月）
  longTermTrend       String    // 'up' | 'neutral' | 'down'
  longTermPriceLow    Decimal   @db.Decimal(12, 2)
  longTermPriceHigh   Decimal   @db.Decimal(12, 2)

  // 推奨アクション
  recommendation      String    // 'buy' | 'hold' | 'sell'
  advice              String    // AIからのアドバイス文章
  confidence          Float     // 0-1の信頼度

  // メタ情報
  analyzedAt          DateTime  @default(now())
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  @@unique([stockId, analyzedAt])
  @@index([stockId])
  @@index([analyzedAt])
}
```

## 予測生成ロジック

### ハイブリッド方式（ルールベース + AI）

#### ステップ1: ルールベースで基礎データを計算

```typescript
async function generateBaselinePrediction(stock: Stock) {
  // 1. 過去の価格推移を取得
  const priceHistory = await prisma.stockPrice.findMany({
    where: { stockId: stock.id },
    orderBy: { date: 'desc' },
    take: 90, // 3ヶ月分
  })

  const currentPrice = priceHistory[0].close
  const weekAgo = priceHistory[5]?.close
  const monthAgo = priceHistory[20]?.close
  const threeMonthsAgo = priceHistory[60]?.close

  // 2. トレンド計算
  const weeklyTrend = calculateTrend(currentPrice, weekAgo)
  const monthlyTrend = calculateTrend(currentPrice, monthAgo)
  const quarterlyTrend = calculateTrend(currentPrice, threeMonthsAgo)

  // 3. ボラティリティ（変動幅）を計算
  const volatility = calculateVolatility(priceHistory)

  // 4. スコアを取得
  const scores = {
    growth: stock.growthScore || 0,
    stability: stock.stabilityScore || 0,
    dividend: stock.dividendScore || 0,
  }

  return {
    currentPrice,
    weeklyTrend,
    monthlyTrend,
    quarterlyTrend,
    volatility,
    scores,
    priceHistory: priceHistory.slice(0, 30), // 直近1ヶ月分
  }
}

function calculateTrend(current: number, past: number): 'up' | 'neutral' | 'down' {
  if (!past) return 'neutral'
  const change = ((current - past) / past) * 100

  if (change > 2) return 'up'
  if (change < -2) return 'down'
  return 'neutral'
}

function calculateVolatility(prices: Array<{ close: number }>): number {
  // 標準偏差を計算
  const values = prices.map(p => p.close)
  const mean = values.reduce((a, b) => a + b) / values.length
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length
  return Math.sqrt(variance)
}
```

#### ステップ2: AIで予測を生成

```typescript
async function generateAIPrediction(stock: Stock, baseline: BaselineData) {
  const prompt = `
あなたは株式投資の初心者向けアドバイザーです。
以下の銘柄について、今後の動向予測とアドバイスを生成してください。

【銘柄情報】
名称: ${stock.name}
ティッカー: ${stock.tickerCode}
セクター: ${stock.sector}
現在価格: ${baseline.currentPrice}円

【過去のトレンド】
- 1週間: ${baseline.weeklyTrend === 'up' ? '上昇' : baseline.weeklyTrend === 'down' ? '下降' : '横ばい'}
- 1ヶ月: ${baseline.monthlyTrend === 'up' ? '上昇' : baseline.monthlyTrend === 'down' ? '下降' : '横ばい'}
- 3ヶ月: ${baseline.quarterlyTrend === 'up' ? '上昇' : baseline.quarterlyTrend === 'down' ? '下降' : '横ばい'}

【スコア】
- 成長性: ${baseline.scores.growth}/100
- 安定性: ${baseline.scores.stability}/100
- 配当性: ${baseline.scores.dividend}/100

【ボラティリティ（価格変動幅）】
${baseline.volatility.toFixed(2)}円

---

以下の形式でJSON形式で回答してください：

{
  "shortTerm": {
    "trend": "up" | "neutral" | "down",
    "priceLow": 数値,
    "priceHigh": 数値,
    "reasoning": "短い理由（30文字以内）"
  },
  "midTerm": {
    "trend": "up" | "neutral" | "down",
    "priceLow": 数値,
    "priceHigh": 数値,
    "reasoning": "短い理由（30文字以内）"
  },
  "longTerm": {
    "trend": "up" | "neutral" | "down",
    "priceLow": 数値,
    "priceHigh": 数値,
    "reasoning": "短い理由（30文字以内）"
  },
  "recommendation": "buy" | "hold" | "sell",
  "advice": "初心者向けのアドバイス（100文字以内、優しい言葉で）",
  "confidence": 0.0〜1.0の信頼度
}

注意事項:
- 価格予測は現在価格とボラティリティを考慮した現実的な範囲にする
- アドバイスは具体的で分かりやすく
- 断定的な表現は避け、「〜が期待できます」「〜の可能性があります」など柔らかい表現を使う
- 投資判断は最終的にユーザー自身が行うことを前提にする
`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini', // コスト効率重視
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  })

  const prediction = JSON.parse(response.choices[0].message.content)

  return prediction
}
```

#### ステップ3: データベースに保存

```typescript
async function saveStockAnalysis(stockId: string, prediction: any) {
  const now = new Date()

  await prisma.stockAnalysis.create({
    data: {
      stockId,

      // 短期予測
      shortTermTrend: prediction.shortTerm.trend,
      shortTermPriceLow: prediction.shortTerm.priceLow,
      shortTermPriceHigh: prediction.shortTerm.priceHigh,

      // 中期予測
      midTermTrend: prediction.midTerm.trend,
      midTermPriceLow: prediction.midTerm.priceLow,
      midTermPriceHigh: prediction.midTerm.priceHigh,

      // 長期予測
      longTermTrend: prediction.longTerm.trend,
      longTermPriceLow: prediction.longTerm.priceLow,
      longTermPriceHigh: prediction.longTerm.priceHigh,

      // アドバイス
      recommendation: prediction.recommendation,
      advice: prediction.advice,
      confidence: prediction.confidence,

      analyzedAt: now,
    }
  })
}
```

## Python実装（推奨）

### メインスクリプト

```python
# scripts/generate_stock_predictions.py

import os
import sys
import json
import psycopg2
import psycopg2.extras
from openai import OpenAI
from datetime import datetime, timedelta
import statistics

DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

client = OpenAI(api_key=OPENAI_API_KEY)

def calculate_trend(current, past):
    """トレンドを計算"""
    if not past:
        return 'neutral'

    change = ((current - past) / past) * 100

    if change > 2:
        return 'up'
    elif change < -2:
        return 'down'
    else:
        return 'neutral'

def calculate_volatility(prices):
    """ボラティリティ（標準偏差）を計算"""
    if len(prices) < 2:
        return 0.0
    return statistics.stdev(prices)

def get_baseline_data(cur, stock_id):
    """ルールベースで基礎データを計算"""

    # 過去90日分の価格データを取得
    cur.execute("""
        SELECT close, date
        FROM "StockPrice"
        WHERE "stockId" = %s
        ORDER BY date DESC
        LIMIT 90
    """, (stock_id,))

    price_history = cur.fetchall()

    if not price_history:
        return None

    current_price = float(price_history[0][0])
    week_ago = float(price_history[5][0]) if len(price_history) > 5 else None
    month_ago = float(price_history[20][0]) if len(price_history) > 20 else None
    three_months_ago = float(price_history[60][0]) if len(price_history) > 60 else None

    # トレンド計算
    weekly_trend = calculate_trend(current_price, week_ago)
    monthly_trend = calculate_trend(current_price, month_ago)
    quarterly_trend = calculate_trend(current_price, three_months_ago)

    # ボラティリティ計算
    prices = [float(p[0]) for p in price_history[:30]]
    volatility = calculate_volatility(prices)

    return {
        'current_price': current_price,
        'weekly_trend': weekly_trend,
        'monthly_trend': monthly_trend,
        'quarterly_trend': quarterly_trend,
        'volatility': volatility,
    }

def generate_ai_prediction(stock, baseline, scores):
    """AIで予測を生成"""

    trend_labels = {
        'up': '上昇',
        'neutral': '横ばい',
        'down': '下降'
    }

    prompt = f"""
あなたは株式投資の初心者向けアドバイザーです。
以下の銘柄について、今後の動向予測とアドバイスを生成してください。

【銘柄情報】
名称: {stock['name']}
ティッカー: {stock['ticker_code']}
セクター: {stock['sector'] or '不明'}
現在価格: {baseline['current_price']}円

【過去のトレンド】
- 1週間: {trend_labels[baseline['weekly_trend']]}
- 1ヶ月: {trend_labels[baseline['monthly_trend']]}
- 3ヶ月: {trend_labels[baseline['quarterly_trend']]}

【スコア】
- 成長性: {scores['growth']}/100
- 安定性: {scores['stability']}/100
- 配当性: {scores['dividend']}/100

【ボラティリティ（価格変動幅）】
{baseline['volatility']:.2f}円

---

以下の形式でJSON形式で回答してください：

{{
  "shortTerm": {{
    "trend": "up" | "neutral" | "down",
    "priceLow": 数値,
    "priceHigh": 数値
  }},
  "midTerm": {{
    "trend": "up" | "neutral" | "down",
    "priceLow": 数値,
    "priceHigh": 数値
  }},
  "longTerm": {{
    "trend": "up" | "neutral" | "down",
    "priceLow": 数値,
    "priceHigh": 数値
  }},
  "recommendation": "buy" | "hold" | "sell",
  "advice": "初心者向けのアドバイス（100文字以内、優しい言葉で）",
  "confidence": 0.0〜1.0の信頼度
}}

注意事項:
- 価格予測は現在価格とボラティリティを考慮した現実的な範囲にする
- アドバイスは具体的で分かりやすく
- 断定的な表現は避け、「〜が期待できます」「〜の可能性があります」など柔らかい表現を使う
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.7,
    )

    prediction = json.loads(response.choices[0].message.content)
    return prediction

def save_prediction(cur, stock_id, prediction):
    """予測をデータベースに保存"""

    cur.execute("""
        INSERT INTO "StockAnalysis" (
            id, "stockId",
            "shortTermTrend", "shortTermPriceLow", "shortTermPriceHigh",
            "midTermTrend", "midTermPriceLow", "midTermPriceHigh",
            "longTermTrend", "longTermPriceLow", "longTermPriceHigh",
            recommendation, advice, confidence,
            "analyzedAt", "createdAt", "updatedAt"
        )
        VALUES (
            gen_random_uuid(), %s,
            %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s,
            NOW(), NOW(), NOW()
        )
    """, (
        stock_id,
        prediction['shortTerm']['trend'],
        prediction['shortTerm']['priceLow'],
        prediction['shortTerm']['priceHigh'],
        prediction['midTerm']['trend'],
        prediction['midTerm']['priceLow'],
        prediction['midTerm']['priceHigh'],
        prediction['longTerm']['trend'],
        prediction['longTerm']['priceLow'],
        prediction['longTerm']['priceHigh'],
        prediction['recommendation'],
        prediction['advice'],
        prediction['confidence'],
    ))

def main():
    print("🚀 Starting stock predictions generation...")

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # すべてのアクティブな銘柄を取得
    cur.execute("""
        SELECT id, "tickerCode", name, sector,
               "growthScore", "stabilityScore", "dividendScore"
        FROM "Stock"
        WHERE "isActive" = true
    """)

    stocks = cur.fetchall()
    total = len(stocks)
    success = 0
    failed = 0

    print(f"📊 Processing {total} stocks...")

    for i, stock in enumerate(stocks, 1):
        stock_dict = {
            'id': stock['id'],
            'ticker_code': stock['tickerCode'],
            'name': stock['name'],
            'sector': stock['sector'],
        }

        scores = {
            'growth': stock['growthScore'] or 0,
            'stability': stock['stabilityScore'] or 0,
            'dividend': stock['dividendScore'] or 0,
        }

        try:
            print(f"[{i}/{total}] Processing {stock_dict['name']} ({stock_dict['ticker_code']})...")

            # 1. 基礎データ計算
            baseline = get_baseline_data(cur, stock_dict['id'])

            if not baseline:
                print(f"  ⚠️  No price data available, skipping...")
                failed += 1
                continue

            # 2. AI予測生成
            prediction = generate_ai_prediction(stock_dict, baseline, scores)

            # 3. データベースに保存
            save_prediction(cur, stock_dict['id'], prediction)

            conn.commit()
            success += 1
            print(f"  ✅ Saved ({prediction['recommendation']})")

        except Exception as e:
            print(f"  ❌ Error: {e}")
            conn.rollback()
            failed += 1

    cur.close()
    conn.close()

    print(f"\n🎉 Completed!")
    print(f"  ✅ Success: {success}")
    print(f"  ❌ Failed: {failed}")
    print(f"  📊 Total: {total}")

    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    main()
```

## GitHub Actions による毎日実行

```yaml
# .github/workflows/daily-stock-predictions.yml

name: Daily Stock Predictions

on:
  schedule:
    # 毎日 朝7時（JST）= 前日22時（UTC）に実行
    - cron: '0 22 * * *'
  workflow_dispatch:  # 手動実行も可能

jobs:
  generate-predictions:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install psycopg2-binary openai

      - name: Generate stock predictions
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: python scripts/generate_stock_predictions.py

      - name: Notify on failure
        if: failure()
        run: echo "Stock predictions generation failed!"
```

## API エンドポイント

### 銘柄の予測を取得

```typescript
// app/api/stocks/[stockId]/analysis/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { stockId: string } }
) {
  try {
    const analysis = await prisma.stockAnalysis.findFirst({
      where: { stockId: params.stockId },
      orderBy: { analyzedAt: 'desc' },
    })

    if (!analysis) {
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      shortTerm: {
        trend: analysis.shortTermTrend,
        priceLow: analysis.shortTermPriceLow.toString(),
        priceHigh: analysis.shortTermPriceHigh.toString(),
      },
      midTerm: {
        trend: analysis.midTermTrend,
        priceLow: analysis.midTermPriceLow.toString(),
        priceHigh: analysis.midTermPriceHigh.toString(),
      },
      longTerm: {
        trend: analysis.longTermTrend,
        priceLow: analysis.longTermPriceLow.toString(),
        priceHigh: analysis.longTermPriceHigh.toString(),
      },
      recommendation: analysis.recommendation,
      advice: analysis.advice,
      confidence: analysis.confidence,
      analyzedAt: analysis.analyzedAt,
    })
  } catch (error) {
    console.error('Error fetching stock analysis:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analysis' },
      { status: 500 }
    )
  }
}
```

## コスト試算

### OpenAI API コスト

**gpt-4o-mini 料金:**
- Input: $0.150 / 1M tokens
- Output: $0.600 / 1M tokens

**1銘柄あたり:**
- プロンプト: 約500トークン = $0.000075
- レスポンス: 約300トークン = $0.000180
- 合計: 約 $0.000255

**毎日100銘柄を分析:**
- 1日: 100銘柄 × $0.000255 = $0.0255
- 1ヶ月: $0.0255 × 30 = $0.765
- 年間: $0.765 × 12 = $9.18

**非常に低コスト！**

## 実装フェーズ

### フェーズ1: データモデルとスクリプト作成

1. Prismaスキーマに `StockAnalysis` モデルを追加
2. マイグレーション実行
3. Python スクリプト作成
4. ローカルでテスト実行

### フェーズ2: GitHub Actions 設定

1. `.github/workflows/daily-stock-predictions.yml` 作成
2. シークレット設定（`OPENAI_API_KEY`）
3. 手動実行でテスト

### フェーズ3: API とUI実装

1. `/api/stocks/[stockId]/analysis` エンドポイント作成
2. マイ銘柄画面に予測表示を追加
3. ローディング・エラーハンドリング

### フェーズ4: リリース

1. 本番環境でGitHub Actions実行
2. 毎日朝7時に自動更新
3. ユーザーに機能をアナウンス

## 注意事項とリスク

### 免責事項

**アプリに表示する注意書き:**

```
⚠️ 投資判断について

この予測はAIによる分析結果であり、将来の株価を
保証するものではありません。投資判断は必ずご自身の
責任で行ってください。

予測の精度には限界があり、市場の急激な変動や
予期せぬ出来事によって、実際の株価は予測から
大きく外れる可能性があります。
```

### データ品質

- 株価データが不足している銘柄はスキップ
- エラーが発生した銘柄はログに記録
- 成功率をモニタリング

### コスト管理

- 月額コストが予算を超えた場合はアラート
- 必要に応じて分析対象銘柄を絞る
- gpt-4o-mini で十分な精度が出ない場合は gpt-4o に変更を検討

## 今後の拡張

### 将来的な機能

1. **予測精度の追跡**
   - 予測と実際の価格を比較
   - AIモデルの精度を継続的に改善

2. **ユーザーごとのカスタマイズ**
   - 投資スタイルに応じた予測
   - リスク許容度を反映

3. **アラート機能との連携**
   - 予測が大きく変わった時に通知
   - 買い時・売り時の推奨が変わった時に通知

4. **詳細分析ページ**
   - チャート表示
   - 過去の予測履歴
   - 予測精度の表示
