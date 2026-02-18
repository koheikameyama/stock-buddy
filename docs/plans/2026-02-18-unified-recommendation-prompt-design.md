# 日次おすすめ生成の共通プロンプト化設計

## 概要

日次おすすめ生成（`generate_personal_recommendations.py`）を、ポートフォリオ分析・購入判断と同じデータ構成に統一する。

**目標:**
- AIに渡すデータをポートフォリオ/ウォッチリスト分析と共通化
- 処理をTypeScriptに移行し、Pythonは最小限（APIを呼ぶだけ）に
- `lib/stock-analysis-context.ts`の共通関数を活用

## 現状の課題

| 項目 | ポートフォリオ/購入判断 | 日次おすすめ（現状） |
|-----|----------------------|-------------------|
| 株価取得 | リアルタイム（30日分） | DBの latestPrice のみ |
| 財務指標 | 詳細に整形して渡す | 渡していない |
| RSI/MACD | 計算して渡す | なし |
| ローソク足 | 分析して渡す | なし |
| チャートパターン | 検出して渡す | なし |
| 市場コンテキスト | 日経平均の状況を渡す | なし |

日次おすすめだけデータが薄く、AI判断の質にばらつきがある。

## アーキテクチャ

```
[GitHub Actions]
    │
    ▼
[Python] ─────────────────────────────►  POST /api/recommendations/generate-daily
 (APIを呼ぶだけ)                              │
                                              ▼
                                    [TypeScript API]
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
              1. 候補絞り込み      2. 詳細データ取得      3. AI選定
              (DBデータで          (リアルタイム株価      (共通プロンプト
               スコア計算)          + テクニカル計算)       使用)
                                              │
                                              ▼
                                    [共通コンテキスト生成]
                                    lib/stock-analysis-context.ts
                                    - buildFinancialMetrics()
                                    - buildTechnicalContext()
                                    - buildCandlestickContext()
                                    - buildChartPatternContext()
                                    - buildMarketContext()
                                    - PROMPT_NEWS_CONSTRAINTS
```

## 処理フロー

### 1. 候補絞り込み（DBデータ使用）

現在のPythonスクリプトのロジックをTypeScriptに移植:

1. ユーザー設定取得（investmentPeriod, riskTolerance, investmentBudget）
2. 全銘柄取得 + 予算フィルタ（100株購入可能な銘柄）
3. スコア計算（投資スタイルに基づく重み付け）
   - weekChangeRate, volumeRatio, volatility, marketCap を正規化
   - 急騰銘柄（+50%超）は除外
   - 赤字+高ボラ銘柄にはペナルティ
4. セクター分散（各セクターから最大5銘柄）
5. ポートフォリオ/ウォッチリスト銘柄を除外
6. **上位15銘柄に絞り込み**

### 2. 詳細データ取得（リアルタイム）

上位15銘柄に対して:

1. リアルタイム株価取得（直近30日分）
2. テクニカル指標計算
   - RSI（14日）
   - MACD
3. ローソク足パターン分析
4. チャートパターン検出
5. 市場コンテキスト取得（日経平均）

### 3. AI選定（共通プロンプト使用）

共通コンテキスト生成関数を使用:

```typescript
import {
  buildFinancialMetrics,
  buildTechnicalContext,
  buildCandlestickContext,
  buildChartPatternContext,
  buildMarketContext,
  PROMPT_NEWS_CONSTRAINTS,
} from "@/lib/stock-analysis-context"
```

## AIに渡すデータ構造

### 各銘柄ごとのコンテキスト

```
【銘柄: {name}（{tickerCode}）】
- セクター: {sector}
- 現在価格: {currentPrice}円
- スコア: {score}点（候補内での順位付け用）

【財務指標】
{buildFinancialMetrics(stock, currentPrice)}

【テクニカル指標】
{buildTechnicalContext(prices)}

【ローソク足パターン】
{buildCandlestickContext(prices)}

【チャートパターン】
{buildChartPatternContext(prices)}
```

### 市場全体のコンテキスト

```
{buildMarketContext(marketData)}
```

## 検討事項

### 上位何銘柄にするか

| 銘柄数 | メリット | デメリット |
|-------|---------|-----------|
| 10 | 処理が速い（10-20秒） | セクター分散が厳しい可能性 |
| 15 | バランス良い | 処理時間15-30秒 |
| 20 | セクター分散しやすい | 処理時間20-40秒、プロンプト長い |

**決定: 15銘柄**

理由:
- 最終選定5銘柄の3倍で十分な候補プール
- セクター分散を確保できる
- 処理時間は許容範囲（30秒程度）

### 並列処理

15銘柄の株価取得を並列化することで処理時間を短縮:

```typescript
const pricesPromises = topStocks.map(stock =>
  fetchHistoricalPrices(stock.tickerCode, "1m")
)
const allPrices = await Promise.all(pricesPromises)
```

## ファイル構成

### 新規作成

| ファイル | 役割 |
|---------|------|
| `app/api/recommendations/generate-daily/route.ts` | メインAPIエンドポイント |
| `lib/recommendation-scoring.ts` | スコア計算ロジック（Pythonから移植） |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `scripts/github-actions/generate_personal_recommendations.py` | APIを呼ぶだけに簡素化 |
| `lib/stock-analysis-context.ts` | 必要に応じて共通定数追加 |

## APIエンドポイント設計

### POST /api/recommendations/generate-daily

**認証:** CRON_SECRET または セッション

**リクエストボディ:**
```json
{
  "session": "morning" | "afternoon" | "evening",
  "userId": "optional - 特定ユーザーのみ生成する場合"
}
```

**レスポンス:**
```json
{
  "success": true,
  "processed": 10,
  "failed": 0,
  "results": [
    {
      "userId": "xxx",
      "recommendations": [
        { "tickerCode": "7203.T", "reason": "..." },
        ...
      ]
    }
  ]
}
```

## 移行計画

1. TypeScript APIエンドポイント作成
2. スコア計算ロジック移植
3. 共通コンテキスト生成を組み込み
4. Pythonスクリプト簡素化
5. テスト・検証
6. 既存Pythonスクリプト削除（オプション）

## リスクと対策

| リスク | 対策 |
|-------|------|
| 処理時間が長くなる | 並列処理、タイムアウト設定 |
| 株価取得API制限 | レート制限対応、リトライ |
| プロンプトが長すぎる | 銘柄数調整、情報の優先度付け |
