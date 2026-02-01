# 「今週のチャンス銘柄」機能の設計

## 背景

### ユーザーの実際のニーズ

現状のStock Buddyは安定銘柄中心の提案だが、ユーザーは：
- 「キオクシアみたいな跳ねそうな株を知りたい」
- 「今が買い時の銘柄はどれ？」
- 「大きく儲かるチャンスも欲しい」

という欲求もある。

### 問題点

**現在:**
```
おすすめ銘柄:
- トヨタ自動車（安定性★★★★★）
- ソニーG（成長性★★★★★）
- 三菱UFJ（安定性★★★★☆）

→ 堅実だけど、面白みが少ない
→ 大きく儲けるチャンスは少ない
```

**ユーザーの本音:**
```
「今週買ったら来週儲かりそうな銘柄は？」
「みんなが気づいてない掘り出し物は？」
```

## 設計方針

### コンセプト: 「基本 + チャンス」の2層構造

```
基本ポートフォリオ（予算の80%）
├─ 安定銘柄・成長銘柄をバランス良く
└─ リスク低め、初心者でも安心

+

今週のチャンス銘柄（予算の20%）
├─ 今が買い時の可能性がある銘柄
├─ リスク高めだが、大きく儲かる可能性
└─ 予算の一部だけで試す
```

### 重要な原則

1. **リスク管理を徹底**
   - チャンス銘柄は予算の10-20%に制限
   - リスクを明示する
   - 選ばなくてもOK

2. **毎日更新**
   - チャンスは逃さない
   - 毎日ダッシュボードをチェックする動機になる

3. **ポジティブな表現**
   - 「リスク高い」より「予算の20%で試そう」
   - でもリスクはちゃんと説明

## UI設計

### オンボーディング: プラン提示

```
┌─────────────────────────────────────────┐
│ 🤖 あなたへの投資プラン                 │
│ 予算: 100,000円                         │
├─────────────────────────────────────────┤
│                                         │
│ 【基本ポートフォリオ】80,000円          │
│                                         │
│ トヨタ自動車（予算の25%）               │
│ ├─ 10株 × 2,500円 = 25,000円           │
│ └─ 安定性 ★★★★★                      │
│                                         │
│ ソニーG（予算の25%）                    │
│ ├─ 2株 × 12,000円 = 24,000円           │
│ └─ 成長性 ★★★★★                      │
│                                         │
│ 三菱UFJ（予算の20%）                    │
│ ├─ 20株 × 1,000円 = 20,000円           │
│ └─ 安定性 ★★★★☆                      │
│                                         │
│ NTT（予算の10%）                        │
│ ├─ 100株 × 110円 = 11,000円            │
│ └─ 配当性 ★★★★☆                      │
│                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━          │
│                                         │
│ 🔥 今週のチャンス銘柄！                 │
│                                         │
│ キオクシア（予算の20%）                 │
│ ├─ 10株 × 1,800円 = 18,000円           │
│ ├─ ⚡ 先週から+15%の急上昇              │
│ ├─ 🚀 半導体需要が急増中                │
│ └─ ⚠️ 短期的に大きく動く可能性あり      │
│                                         │
│ 💡 なぜ20%？                            │
│ 大きく儲かる可能性がある一方、           │
│ 値動きが激しいため、予算の一部だけで     │
│ 試すのがおすすめです。                   │
│                                         │
│ [ このプランで始める ]                  │
│ [ 安定重視（チャンス銘柄なし）]         │
│                                         │
└─────────────────────────────────────────┘
```

### オンボーディング: チャンス銘柄の選択画面

```
┌─────────────────────────────────────────┐
│ おすすめ銘柄 (5/5)                      │
├─────────────────────────────────────────┤
│                                         │
│ 【キオクシア (6600)】                   │
│ おすすめ: 10株 × 1,800円 = 18,000円    │
│ （予算の20%）                           │
│                                         │
│ 🔥 今週のチャンス銘柄！                 │
│                                         │
│ なぜ今がチャンス？                      │
│ ├─ ⚡ 先週から+15%の急上昇              │
│ ├─ 🚀 半導体需要が急増中                │
│ ├─ 📈 AIが短期上昇を予測                │
│ └─ 💹 取引量が通常の2.5倍               │
│                                         │
│ ⚠️ 知っておいてほしいこと               │
│ ├─ 短期的に大きく上下する可能性あり     │
│ ├─ 損する可能性も高め                   │
│ └─ 予算の20%だけに抑えるのがおすすめ    │
│                                         │
│ この銘柄はどうしますか？                │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ 💰 プラン通りに買った              │  │
│ │ 10株 × 1,800円で記録               │  │
│ └───────────────────────────────────┘  │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ 📝 違う金額で買った                │  │
│ │ 実際の購入内容を入力               │  │
│ └───────────────────────────────────┘  │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ 📌 マイ銘柄に追加だけ              │  │
│ │ 様子を見てから判断                 │  │
│ └───────────────────────────────────┘  │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ 🛡️ 今回はパス                      │  │
│ │ リスクを取りたくない               │  │
│ └───────────────────────────────────┘  │
│                                         │
│ [ 次へ ] [ 完了 ]                       │
│                                         │
└─────────────────────────────────────────┘
```

### ダッシュボード: 今週のチャンス銘柄セクション

```
┌─────────────────────────────────────────┐
│ 🔥 今週のチャンス銘柄                   │
│                                 更新: 今朝7時 │
├─────────────────────────────────────────┤
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ 【キオクシア (6600)】             │  │
│ │ 1,800円 ▲240円 (+15.4%)           │  │
│ │                                   │  │
│ │ 🚀 今がチャンス！                 │  │
│ │ ├─ 先週から+15%の急上昇          │  │
│ │ ├─ 半導体需要が急増中            │  │
│ │ ├─ 業績回復の兆し                │  │
│ │ └─ AIが短期上昇を予測            │  │
│ │                                   │  │
│ │ 💡 おすすめ投資額                 │  │
│ │ 予算の10-20%程度                  │  │
│ │                                   │  │
│ │ ⚠️ リスク                         │  │
│ │ 短期的に大きく上下する可能性あり  │  │
│ │                                   │  │
│ │ [マイ銘柄に追加] [詳しく見る]     │  │
│ └───────────────────────────────────┘  │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ 【ルネサスエレクトロニクス】      │  │
│ │ 2,400円 ▲180円 (+8.1%)            │  │
│ │ ...                               │  │
│ └───────────────────────────────────┘  │
│                                         │
│ [ もっと見る ]                          │
│                                         │
└─────────────────────────────────────────┘
```

## データモデル

### HotStock テーブル

```prisma
// 「今週のチャンス」銘柄の記録
model HotStock {
  id              String    @id @default(cuid())
  stockId         String
  stock           Stock     @relation(fields: [stockId], references: [id], onDelete: Cascade)

  // ホットスコア（0-100）
  hotScore        Int

  // チャンスの理由
  reasons         String[]  // ["先週から+15%", "半導体需要急増", ...]

  // リスク要因
  risks           String[]  // ["短期的に大きく変動", "ボラティリティ高", ...]

  // 推奨投資額（予算の%）
  recommendedBudgetPercent Int  // 10-20

  // AIからの推奨コメント
  recommendation  String

  // 信頼度（0.0-1.0）
  confidence      Float

  // 有効期限（通常は1週間）
  validUntil      DateTime

  // メタ情報
  analyzedAt      DateTime  @default(now())
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([stockId, analyzedAt])
  @@index([stockId])
  @@index([hotScore])
  @@index([validUntil])
  @@index([analyzedAt])
}
```

## ホット銘柄の検出ロジック

### ハイブリッド方式（ルールベース + AI）

#### ステップ1: ルールベースでスクリーニング

```python
def screen_hot_stocks(stocks):
    """ホット銘柄の候補をスクリーニング"""
    candidates = []

    for stock in stocks:
        score = 0
        reasons = []

        # 1. 価格の急上昇（1週間で+10%以上）
        week_change = calculate_price_change(stock, '1week')
        if week_change > 10:
            score += 30
            reasons.append(f'先週から+{week_change:.1f}%の急上昇')

        # 2. 出来高の急増（通常の1.5倍以上）
        volume_ratio = calculate_volume_ratio(stock)
        if volume_ratio > 1.5:
            score += 20
            reasons.append(f'取引量が通常の{volume_ratio:.1f}倍')

        # 3. セクター全体の好調
        sector_trend = get_sector_trend(stock.sector)
        if sector_trend > 5:
            score += 15
            reasons.append(f'{stock.sector}業界全体が好調')

        # 4. ボラティリティ（変動幅）が高い
        volatility = calculate_volatility(stock)
        if volatility > 100:  # 価格の標準偏差が100円以上
            score += 10
            reasons.append('値動きが活発')

        # 5. 過去の予測精度が高い銘柄
        prediction_accuracy = get_prediction_accuracy(stock)
        if prediction_accuracy > 0.7:
            score += 15

        # スコアが50以上の銘柄を候補とする
        if score >= 50:
            candidates.append({
                'stock': stock,
                'score': score,
                'reasons': reasons,
            })

    # スコア順にソート
    candidates.sort(key=lambda x: x['score'], reverse=True)

    # 上位5銘柄を返す
    return candidates[:5]
```

#### ステップ2: AIで詳細分析

```python
def analyze_with_ai(stock, baseline_score, reasons):
    """AIでホット銘柄を詳細分析"""

    prompt = f"""
あなたは株式投資アドバイザーです。
以下の銘柄が「今週のチャンス銘柄」として適切かを分析してください。

【銘柄情報】
名称: {stock.name}
ティッカー: {stock.tickerCode}
セクター: {stock.sector}
現在価格: {stock.currentPrice}円

【検出された特徴】
{chr(10).join(f'- {r}' for r in reasons)}

【過去の価格推移】
1週間前: {stock.price_1w_ago}円 → 現在: {stock.currentPrice}円 ({stock.week_change:+.1f}%)
1ヶ月前: {stock.price_1m_ago}円 → 現在: {stock.currentPrice}円 ({stock.month_change:+.1f}%)

【出来高】
通常: {stock.avg_volume}株
今日: {stock.today_volume}株（{stock.volume_ratio:.1f}倍）

---

以下の形式でJSON形式で回答してください：

{{
  "isHot": true/false,
  "hotScore": 0-100,
  "reasons": [
    "先週から+15%の急上昇",
    "半導体需要が急増中",
    "業績回復の兆し"
  ],
  "risks": [
    "短期的に大きく変動する可能性",
    "業界全体の不透明感"
  ],
  "recommendedBudgetPercent": 10-20,
  "recommendation": "短期的に大きく儲かる可能性がありますが、リスクも高いです。予算の10-20%程度で試すことをおすすめします。",
  "confidence": 0.0〜1.0
}}

注意事項:
- 初心者向けのアドバイスであることを意識
- リスクは正直に伝える
- 断定的な表現は避ける（「〜の可能性があります」など）
- 投資判断は最終的にユーザー自身が行うことを前提
"""

    response = openai.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.7,
    )

    analysis = json.loads(response.choices[0].message.content)
    return analysis
```

#### ステップ3: データベースに保存

```python
def save_hot_stock(stock_id, analysis):
    """ホット銘柄をデータベースに保存"""

    # 有効期限: 1週間後
    valid_until = datetime.now() + timedelta(days=7)

    cur.execute("""
        INSERT INTO "HotStock" (
            id, "stockId", "hotScore",
            reasons, risks,
            "recommendedBudgetPercent",
            recommendation, confidence,
            "validUntil", "analyzedAt",
            "createdAt", "updatedAt"
        )
        VALUES (
            gen_random_uuid(), %s, %s,
            %s, %s,
            %s,
            %s, %s,
            %s, NOW(),
            NOW(), NOW()
        )
    """, (
        stock_id,
        analysis['hotScore'],
        analysis['reasons'],
        analysis['risks'],
        analysis['recommendedBudgetPercent'],
        analysis['recommendation'],
        analysis['confidence'],
        valid_until,
    ))
```

## Python実装

### メインスクリプト

```python
# scripts/generate_hot_stocks.py

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

def calculate_price_change(cur, stock_id, days=7):
    """指定期間の価格変動率を計算"""
    cur.execute("""
        SELECT close
        FROM "StockPrice"
        WHERE "stockId" = %s
        ORDER BY date DESC
        LIMIT %s
    """, (stock_id, days + 1))

    prices = [row[0] for row in cur.fetchall()]

    if len(prices) < days + 1:
        return 0

    current = float(prices[0])
    past = float(prices[days])

    return ((current - past) / past) * 100

def calculate_volume_ratio(cur, stock_id):
    """出来高の急増を検出"""
    # 簡易実装: 直近3日と過去30日の平均を比較
    cur.execute("""
        SELECT volume
        FROM "StockPrice"
        WHERE "stockId" = %s
        ORDER BY date DESC
        LIMIT 30
    """, (stock_id,))

    volumes = [float(row[0] or 0) for row in cur.fetchall()]

    if len(volumes) < 10:
        return 1.0

    recent_avg = sum(volumes[:3]) / 3
    past_avg = sum(volumes[3:]) / len(volumes[3:])

    if past_avg == 0:
        return 1.0

    return recent_avg / past_avg

def screen_hot_stocks(cur):
    """ルールベースでホット銘柄をスクリーニング"""

    cur.execute("""
        SELECT id, "tickerCode", name, sector
        FROM "Stock"
        WHERE "isActive" = true
    """)

    stocks = cur.fetchall()
    candidates = []

    for stock in stocks:
        stock_id = stock['id']
        score = 0
        reasons = []

        # 1. 価格の急上昇
        week_change = calculate_price_change(cur, stock_id, 7)
        if week_change > 10:
            score += 30
            reasons.append(f'先週から+{week_change:.1f}%の急上昇')

        # 2. 出来高の急増
        volume_ratio = calculate_volume_ratio(cur, stock_id)
        if volume_ratio > 1.5:
            score += 20
            reasons.append(f'取引量が通常の{volume_ratio:.1f}倍')

        # 3. ボラティリティ
        volatility = calculate_volatility(cur, stock_id)
        if volatility > 50:
            score += 10
            reasons.append('値動きが活発')

        # スコア50以上を候補とする
        if score >= 50:
            candidates.append({
                'stock': stock,
                'score': score,
                'reasons': reasons,
                'week_change': week_change,
                'volume_ratio': volume_ratio,
            })

    # スコア順にソート
    candidates.sort(key=lambda x: x['score'], reverse=True)

    # 上位5銘柄
    return candidates[:5]

def calculate_volatility(cur, stock_id):
    """ボラティリティ（標準偏差）を計算"""
    cur.execute("""
        SELECT close
        FROM "StockPrice"
        WHERE "stockId" = %s
        ORDER BY date DESC
        LIMIT 30
    """, (stock_id,))

    prices = [float(row[0]) for row in cur.fetchall()]

    if len(prices) < 10:
        return 0

    return statistics.stdev(prices)

def analyze_with_ai(stock, baseline_data):
    """AIで詳細分析"""

    prompt = f"""
あなたは株式投資アドバイザーです。
以下の銘柄が「今週のチャンス銘柄」として適切かを分析してください。

【銘柄情報】
名称: {stock['name']}
ティッカー: {stock['tickerCode']}
セクター: {stock['sector'] or '不明'}

【検出された特徴】
{chr(10).join(f'- {r}' for r in baseline_data['reasons'])}

【価格変動】
1週間: {baseline_data['week_change']:+.1f}%

【出来高】
通常比: {baseline_data['volume_ratio']:.1f}倍

---

以下の形式でJSON形式で回答してください：

{{
  "isHot": true/false,
  "hotScore": 0-100,
  "reasons": [
    "先週から+15%の急上昇",
    "需要が急増中"
  ],
  "risks": [
    "短期的に大きく変動する可能性"
  ],
  "recommendedBudgetPercent": 10-20,
  "recommendation": "初心者向けのアドバイス（100文字以内）",
  "confidence": 0.0〜1.0
}}

注意:
- 初心者向けのアドバイス
- リスクは正直に伝える
- 断定的な表現は避ける
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.7,
    )

    analysis = json.loads(response.choices[0].message.content)
    return analysis

def save_hot_stock(cur, stock_id, analysis):
    """ホット銘柄を保存"""

    valid_until = datetime.now() + timedelta(days=7)

    cur.execute("""
        INSERT INTO "HotStock" (
            id, "stockId", "hotScore",
            reasons, risks,
            "recommendedBudgetPercent",
            recommendation, confidence,
            "validUntil", "analyzedAt",
            "createdAt", "updatedAt"
        )
        VALUES (
            gen_random_uuid(), %s, %s,
            %s, %s,
            %s,
            %s, %s,
            %s, NOW(),
            NOW(), NOW()
        )
    """, (
        stock_id,
        analysis['hotScore'],
        analysis['reasons'],
        analysis['risks'],
        analysis['recommendedBudgetPercent'],
        analysis['recommendation'],
        analysis['confidence'],
        valid_until,
    ))

def main():
    print("🔥 Starting hot stocks detection...")

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # 古いホット銘柄を削除（有効期限切れ）
    cur.execute("""
        DELETE FROM "HotStock"
        WHERE "validUntil" < NOW()
    """)
    conn.commit()

    # ルールベースでスクリーニング
    print("📊 Screening stocks...")
    candidates = screen_hot_stocks(cur)

    print(f"Found {len(candidates)} candidates")

    success = 0
    failed = 0

    for i, candidate in enumerate(candidates, 1):
        stock = candidate['stock']

        try:
            print(f"[{i}/{len(candidates)}] Analyzing {stock['name']}...")

            # AIで詳細分析
            analysis = analyze_with_ai(stock, candidate)

            if not analysis['isHot']:
                print(f"  ⏭️  Not hot enough, skipping...")
                continue

            # データベースに保存
            save_hot_stock(cur, stock['id'], analysis)

            conn.commit()
            success += 1
            print(f"  ✅ Saved (score: {analysis['hotScore']})")

        except Exception as e:
            print(f"  ❌ Error: {e}")
            conn.rollback()
            failed += 1

    cur.close()
    conn.close()

    print(f"\n🎉 Completed!")
    print(f"  ✅ Success: {success}")
    print(f"  ❌ Failed: {failed}")

    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    main()
```

## GitHub Actions による毎日実行

```yaml
# .github/workflows/daily-hot-stocks.yml

name: Daily Hot Stocks Detection

on:
  schedule:
    # 毎日 朝7時（JST）= 前日22時（UTC）
    - cron: '0 22 * * *'
  workflow_dispatch:

jobs:
  detect-hot-stocks:
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

      - name: Detect hot stocks
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: python scripts/generate_hot_stocks.py

      - name: Notify on failure
        if: failure()
        run: echo "Hot stocks detection failed!"
```

## API エンドポイント

### ホット銘柄一覧を取得

```typescript
// app/api/hot-stocks/route.ts

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const hotStocks = await prisma.hotStock.findMany({
      where: {
        validUntil: {
          gte: new Date(),
        },
      },
      include: {
        stock: {
          select: {
            id: true,
            tickerCode: true,
            name: true,
            sector: true,
          },
        },
      },
      orderBy: {
        hotScore: 'desc',
      },
      take: 10,
    })

    // 最新の株価を取得
    const hotStocksWithPrice = await Promise.all(
      hotStocks.map(async (hotStock) => {
        const latestPrice = await prisma.stockPrice.findFirst({
          where: { stockId: hotStock.stockId },
          orderBy: { date: 'desc' },
        })

        return {
          id: hotStock.id,
          stock: hotStock.stock,
          hotScore: hotStock.hotScore,
          reasons: hotStock.reasons,
          risks: hotStock.risks,
          recommendedBudgetPercent: hotStock.recommendedBudgetPercent,
          recommendation: hotStock.recommendation,
          confidence: hotStock.confidence,
          currentPrice: latestPrice?.close.toString() || null,
          analyzedAt: hotStock.analyzedAt,
        }
      })
    )

    return NextResponse.json({
      success: true,
      hotStocks: hotStocksWithPrice,
    })
  } catch (error) {
    console.error('Error fetching hot stocks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch hot stocks' },
      { status: 500 }
    )
  }
}
```

## コスト試算

### OpenAI API コスト

**候補銘柄のスクリーニング:**
- ルールベースで無料
- 全銘柄から上位5銘柄を抽出

**AIによる詳細分析:**
- 5銘柄 × 約800トークン = 4,000トークン/日
- gpt-4o-mini: 約 $0.0012/日
- 月額: 約 $0.036

**非常に低コスト！**

## 実装フェーズ

### フェーズ1: データモデルとスクリプト

1. Prismaスキーマに `HotStock` モデルを追加
2. マイグレーション実行
3. Python スクリプト作成
4. ローカルでテスト実行

### フェーズ2: GitHub Actions 設定

1. `.github/workflows/daily-hot-stocks.yml` 作成
2. 毎日朝7時に自動実行
3. 手動実行でテスト

### フェーズ3: API とUI実装

1. `/api/hot-stocks` エンドポイント作成
2. ダッシュボードに「今週のチャンス銘柄」セクション追加
3. オンボーディングに統合

### フェーズ4: リリース

1. 本番環境でGitHub Actions実行
2. 毎日更新を確認
3. ユーザーに機能をアナウンス

## 注意事項とリスク管理

### 免責事項

**アプリに表示する注意書き:**

```
⚠️ チャンス銘柄について

「今週のチャンス銘柄」は、短期的に価格が上昇する
可能性がある銘柄をAIが分析したものです。

ただし：
- 将来の株価を保証するものではありません
- 値動きが激しく、損失のリスクも高いです
- 予算の10-20%程度に抑えることをおすすめします

投資判断は必ずご自身の責任で行ってください。
```

### リスク管理の徹底

1. **予算制限**
   - チャンス銘柄は予算の10-20%に制限
   - オンボーディングで自動計算

2. **リスクの明示**
   - 「短期的に大きく変動する可能性」を明記
   - 選ばなくてもOKであることを強調

3. **ユーザー選択の尊重**
   - チャンス銘柄はオプション
   - 「安定重視」を選べる

## 今後の拡張

### 将来的な機能

1. **ホット銘柄のカテゴリ分け**
   - テクノロジー系
   - 半導体系
   - 新興企業系

2. **過去の精度追跡**
   - 予測と実際の結果を比較
   - 精度向上に活用

3. **ユーザーごとのカスタマイズ**
   - リスク許容度に応じた提案
   - 過去の購入履歴から学習

4. **通知機能**
   - 新しいチャンス銘柄が見つかったら通知
   - 価格が急上昇したら通知
