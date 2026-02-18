# AI分析アーキテクチャ

## 概要

ポートフォリオとウォッチリストで異なるAI分析フローを使用しています。

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AI分析の全体像                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    日次バッチ     ┌─────────────────┐              │
│  │   Stock     │ ───────────────→ │  StockAnalysis  │              │
│  │  (銘柄)     │  stock-predictions│ (価格予測)       │              │
│  └─────────────┘                   └────────┬────────┘              │
│                                             │                       │
│        ┌────────────────────────────────────┴────────────┐          │
│        │                                                 │          │
│        ▼                                                 ▼          │
│  ┌─────────────────┐                           ┌─────────────────┐  │
│  │ PortfolioStock  │                           │ WatchlistStock  │  │
│  │ (ポートフォリオ) │                           │ (ウォッチリスト) │  │
│  └────────┬────────┘                           └────────┬────────┘  │
│           │                                             │           │
│           │ portfolio-analysis                          │ purchase- │
│           │ (保有情報を考慮)                             │ recommendation │
│           ▼                                             ▼           │
│  ┌─────────────────┐                           ┌─────────────────┐  │
│  │StockAnalysisCard│                           │PurchaseRecommend│  │
│  │ (AI売買判断)     │                           │ ation (購入判断) │  │
│  └─────────────────┘                           └─────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. ポートフォリオ（保有銘柄）

### データフロー

```
日次バッチ                    オンデマンド                  表示
───────────                  ──────────                  ────
stock-predictions.yml        portfolio-analysis API      StockAnalysisCard
       │                            │                         │
       ▼                            ▼                         │
┌─────────────┐             ┌──────────────┐                  │
│StockAnalysis│ ◄───────────│PortfolioStock│                  │
│(価格予測)    │   参照       │(テキスト分析) │ ─────────────────┤
│             │             │              │                  │
│- shortTermTrend           │- shortTerm   │                  │
│- shortTermPriceLow/High   │- mediumTerm  │                  │
│- shortTermText            │- longTerm    │                  │
│- limitPrice               │- simpleStatus│                  │
│- stopLossPrice            │- suggestedSellPrice            │
│- recommendation           │- sellReason  │                  │
└─────────────┘             └──────────────┘                  │
       │                            │                         │
       └────────────────────────────┴─────────────────────────┘
```

### 関連ファイル

| ファイル | 役割 |
|---------|------|
| `scripts/analysis/generate-stock-predictions.ts` | 日次バッチ: StockAnalysis生成 |
| `app/api/stocks/[stockId]/portfolio-analysis/route.ts` | オンデマンド: 保有情報を考慮したテキスト分析 |
| `app/components/StockAnalysisCard.tsx` | 表示コンポーネント |

### StockAnalysisCard の表示優先度

```typescript
// テキスト分析の優先度: portfolioAnalysis > prediction
{portfolioAnalysis?.shortTerm || prediction?.shortTerm.text}
```

1. `portfolioAnalysis.shortTerm` (保有情報を考慮したテキスト)
2. `prediction.shortTerm.text` (汎用の価格予測テキスト)

### 表示セクション

1. **短期/中期/長期予測** - テキスト解説付き
2. **損切りアラート** - ユーザー設定の損切りラインに到達時
3. **AIアドバイス** - 総合的なアドバイス
4. **AI推奨価格** - 指値/逆指値（recommendation に応じて表示）
5. **AIの売却判断** - 売却推奨時のみ表示

---

## 2. ウォッチリスト（気になる銘柄）

### データフロー

```
日次バッチ                    オンデマンド                  表示
───────────                  ──────────                  ────
stock-predictions.yml        purchase-recommendation API PurchaseRecommendation
       │                            │                         │
       ▼                            ▼                         │
┌─────────────┐             ┌──────────────────┐              │
│StockAnalysis│ ◄───────────│PurchaseRecommend │              │
│(価格予測)    │   参照       │ation (購入判断)  │ ────────────┤
│             │             │                  │              │
│- shortTermText            │- recommendation  │              │
│- limitPrice               │- reason          │              │
│- stopLossPrice            │- positives       │              │
│- recommendation           │- concerns        │              │
└─────────────┘             └──────────────────┘              │
       │                            │                         │
       └────────────────────────────┴─────────────────────────┘
```

### 関連ファイル

| ファイル | 役割 |
|---------|------|
| `scripts/analysis/generate-stock-predictions.ts` | 日次バッチ: StockAnalysis生成 |
| `scripts/github-actions/generate_purchase_recommendations.py` | 日次バッチ: PurchaseRecommendation生成 |
| `app/api/stocks/[stockId]/purchase-recommendation/route.ts` | API: 購入判断取得/生成 |
| `app/components/PurchaseRecommendation.tsx` | 表示コンポーネント |

### PurchaseRecommendation API の動作

**GET**:
- `PurchaseRecommendation` から購入判断を取得
- `StockAnalysis` から価格予測データを取得してマージ

**POST**:
- `StockAnalysis` の予測データをプロンプトに含めて購入判断を生成
- 予測データがある場合はそのまま使用（整合性を保つ）

### 表示セクション

1. **価格帯予測** - 短期/中期/長期（StockAnalysisから取得）
2. **AI推奨価格** - 指値/逆指値
3. **購入判断** - buy/stay/avoid
4. **良いところ/不安な点** - 深掘り評価
5. **こんな人におすすめ** - ターゲットユーザー
6. **こうなったら買い時** - 買い時条件（stay時のみ）

---

## 3. データベーステーブル

### StockAnalysis（共通の価格予測）

```prisma
model StockAnalysis {
  id                String   @id @default(cuid())
  stockId           String

  // 価格予測
  shortTermTrend    String   // "up" | "neutral" | "down"
  shortTermPriceLow Decimal
  shortTermPriceHigh Decimal
  shortTermText     String?  // テキスト解説

  midTermTrend      String
  midTermPriceLow   Decimal
  midTermPriceHigh  Decimal
  midTermText       String?

  longTermTrend     String
  longTermPriceLow  Decimal
  longTermPriceHigh Decimal
  longTermText      String?

  // 推奨
  recommendation    String   // "buy" | "hold" | "sell"
  advice            String
  confidence        Float

  // 価格
  limitPrice        Decimal? // 指値
  stopLossPrice     Decimal? // 逆指値

  analyzedAt        DateTime
}
```

### PortfolioStock（保有情報を考慮した分析）

```prisma
model PortfolioStock {
  // ... 保有情報 ...

  // テキスト分析（保有情報を考慮）
  shortTerm          String?
  mediumTerm         String?
  longTerm           String?

  // ステータス
  simpleStatus       String?  // "好調" | "様子見" | "注意" | "警戒"
  statusType         String?  // "good" | "neutral" | "caution" | "warning"
  marketSignal       String?  // "bullish" | "neutral" | "bearish"

  // 売却判断
  suggestedSellPrice   Decimal?
  suggestedSellPercent Int?
  sellReason           String?
  sellCondition        String?

  lastAnalysis       DateTime?
}
```

### PurchaseRecommendation（購入判断）

```prisma
model PurchaseRecommendation {
  id             String   @id @default(cuid())
  stockId        String
  userId         String?  // パーソナライズ用

  // 購入判断
  recommendation String   // "buy" | "stay" | "avoid"
  confidence     Float
  reason         String
  caution        String

  // 深掘り評価
  positives      String?
  concerns       String?
  suitableFor    String?

  // 買い時条件
  buyCondition   String?

  // パーソナライズ
  userFitScore       Int?
  budgetFit          Boolean?
  periodFit          Boolean?
  riskFit            Boolean?
  personalizedReason String?
}
```

---

## 4. 日次バッチジョブ

### stock-predictions.yml

**実行タイミング**: 平日 朝7:00 JST

**処理内容**:
1. ウォッチリスト + ポートフォリオの銘柄を取得
2. 各銘柄に対して `generate-stock-predictions.ts` を実行
3. `StockAnalysis` レコードを作成

**生成されるデータ**:
- 短期/中期/長期の価格予測（トレンド、価格帯、テキスト解説）
- 推奨（buy/hold/sell）
- 指値/逆指値
- アドバイス

### purchase-recommendations.yml

**実行タイミング**: 平日 朝8:00 JST（stock-predictionsの後）

**処理内容**:
1. ウォッチリストの銘柄を取得
2. 各銘柄に対して `purchase-recommendation` API を呼び出し
3. `PurchaseRecommendation` レコードを作成/更新
4. 買い推奨（confidence >= 60%）の場合、通知を送信

**ポイント**:
- `StockAnalysis` のデータを参照して購入判断を生成
- 予測データがある場合はそのまま使用（整合性を保つ）

---

## 5. オンデマンド分析（「今すぐ分析する」ボタン）

### ポートフォリオの場合

```
StockAnalysisCard
    │
    │ generateAnalysis()
    ▼
analysis-jobs API (type: "portfolio-analysis")
    │
    │ バックグラウンドで実行
    ▼
portfolio-analysis API (POST)
    │
    │ AIが分析を生成
    ▼
┌─────────────────────────────────┐
│ 1. PortfolioStock を更新        │
│    - shortTerm, mediumTerm など │
│                                 │
│ 2. StockAnalysis を作成         │
│    - 価格予測データ              │
└─────────────────────────────────┘
```

### ウォッチリストの場合

```
PurchaseRecommendation
    │
    │ handleReanalyze()
    ▼
analysis-jobs API (type: "purchase-recommendation")
    │
    │ バックグラウンドで実行
    ▼
purchase-recommendation API (POST)
    │
    │ AIが分析を生成（StockAnalysisを参照）
    ▼
┌─────────────────────────────────┐
│ PurchaseRecommendation を作成   │
│ - recommendation, reason など   │
│                                 │
│ ※ StockAnalysis は更新しない    │
│   （日次バッチで生成済みを使用）  │
└─────────────────────────────────┘
```

---

## 6. まとめ

| 項目 | ポートフォリオ | ウォッチリスト |
|------|--------------|--------------|
| **コンポーネント** | StockAnalysisCard | PurchaseRecommendation |
| **API** | portfolio-analysis | purchase-recommendation |
| **メインテーブル** | PortfolioStock | PurchaseRecommendation |
| **価格予測ソース** | StockAnalysis | StockAnalysis |
| **テキスト分析** | PortfolioStock.shortTerm等 | StockAnalysis.shortTermText等 |
| **保有情報考慮** | あり（損益、平均取得単価） | なし |
| **タイトル** | AI売買判断 | - |
| **主な判断** | buy/hold/sell + 売却判断 | buy/stay/avoid |
