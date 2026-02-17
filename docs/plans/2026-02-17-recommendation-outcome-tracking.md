# AI推薦精度検証の仕組み化

## 背景

現在、AI推薦の精度は週次レポート（`WeeklyAIReport`）で集計値として確認できる。
しかし自分一人で検証しているフェーズでは、**個別の推薦がどうなったか**を追えないと精度改善のサイクルが回せない。

### 現状の課題

| # | 課題 | 影響 |
|---|------|------|
| 1 | 個別推薦の結果が残らない | 「どの推薦が外れたか」を後から掘れない |
| 2 | 推薦時点の株価を記録していない | yfinanceから再取得するため再現性が弱い |
| 3 | 評価が7日後の1時点だけ | 1日後・14日後の精度がわからない |
| 4 | 条件別の傾向が見えない | セクター・信頼度・ボラティリティ別に切れない |
| 5 | ベンチマーク比較がない | 日経225に勝っているのか不明 |

### 目的

- 推薦1件ごとに結果を追跡し、「なぜ外したか」をデータで把握できるようにする
- スコアリングロジック調整 → 精度計測のサイクルを効率的に回す

## データベース設計

### 新テーブル: `RecommendationOutcome`

推薦1件ごとに、推薦時点の状態と時間経過後のリターンを記録する。

```prisma
model RecommendationOutcome {
  id                    String   @id @default(cuid())

  // 推薦の種類と参照
  type                  String   // "daily" | "purchase" | "analysis"
  recommendationId      String   // 元の推薦レコードのID

  // 銘柄情報（分析用に非正規化して保持）
  stockId               String
  stock                 Stock    @relation(fields: [stockId], references: [id], onDelete: Cascade)
  tickerCode            String
  sector                String?

  // 推薦時点のスナップショット（後から変わる値を固定）
  recommendedAt         DateTime
  priceAtRec            Decimal  @db.Decimal(12, 2)
  prediction            String   // "buy" | "stay" | "remove" | "up" | "down" | "neutral"
  confidence            Decimal? @db.Decimal(5, 2)
  volatility            Decimal? @db.Decimal(8, 2)
  marketCap             BigInt?

  // 時間経過ごとのリターン（%）- バッチで段階的に埋まる
  returnAfter1Day       Decimal? @db.Decimal(8, 2)
  returnAfter3Days      Decimal? @db.Decimal(8, 2)
  returnAfter7Days      Decimal? @db.Decimal(8, 2)
  returnAfter14Days     Decimal? @db.Decimal(8, 2)

  // ベンチマーク（同期間の日経225リターン）
  benchmarkReturn7Days  Decimal? @db.Decimal(8, 2)

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@unique([type, recommendationId])
  @@index([type, recommendedAt])
  @@index([sector])
  @@index([tickerCode])
}
```

#### 設計判断

| 判断 | 理由 |
|------|------|
| 推薦時点の値を非正規化 | Stockテーブルの値は日々更新される。推薦時点のvolatility等を後から参照するために固定 |
| リターンはnullable | バッチで段階的に埋まる。1日後は翌日、7日後は1週間後に初めて値が入る |
| 30日後リターンは省略 | 短期〜中期の検証が主目的。必要になったら追加 |
| ベンチマークは7日のみ | 最も頻繁に確認する時間枠に絞る |
| `recommendationId`は文字列 | 3種類のテーブルを1つで参照するため、リレーションではなくID保持 |

## バッチ処理

### 新スクリプト: `scripts/github-actions/evaluate_recommendation_outcomes.py`

#### 処理フロー

```
1. Outcomeレコードの中で、まだ埋まっていないリターンを持つものを取得
   - returnAfter1Day IS NULL AND recommendedAt <= 1日前
   - returnAfter3Days IS NULL AND recommendedAt <= 3日前
   - returnAfter7Days IS NULL AND recommendedAt <= 7日前
   - returnAfter14Days IS NULL AND recommendedAt <= 14日前

2. 対象銘柄の株価をyfinanceでバッチ取得

3. 各Outcomeのリターンを計算
   - returnAfterNDays = (priceAfterNDays - priceAtRec) / priceAtRec * 100

4. 7日後評価時に日経225（^N225）の同期間リターンも記録
   - benchmarkReturn7Days = (nikkei7DaysLater - nikkeiAtRec) / nikkeiAtRec * 100

5. DBを更新
```

#### 実行スケジュール

```yaml
# .github/workflows/evaluate-outcomes.yml
schedule:
  - cron: "0 7 * * 1-5"  # 平日 16:00 JST（場が閉まった後）
```

週末・祝日は株価が動かないため平日のみ。

### 既存スクリプトの変更

推薦を保存する3箇所で、同時にOutcomeレコードを作成する。

#### 1. `generate_personal_recommendations.py`

UserDailyRecommendation保存後にOutcomeを作成:

```python
# 推薦保存後
outcome_data = {
    "type": "daily",
    "recommendationId": recommendation_id,
    "stockId": stock_id,
    "tickerCode": ticker_code,
    "sector": sector,
    "recommendedAt": now,
    "priceAtRec": latest_price,
    "prediction": "buy",       # 日次おすすめは全てbuy相当
    "confidence": None,        # 日次おすすめにはconfidenceがない
    "volatility": volatility,
    "marketCap": market_cap,
}
insert_recommendation_outcome(conn, outcome_data)
```

#### 2. `generate_purchase_recommendations.py`

PurchaseRecommendation保存後にOutcomeを作成:

```python
outcome_data = {
    "type": "purchase",
    "recommendationId": recommendation_id,
    "stockId": stock_id,
    "tickerCode": ticker_code,
    "sector": sector,
    "recommendedAt": now,
    "priceAtRec": latest_price,
    "prediction": recommendation,  # "buy" | "stay" | "remove"
    "confidence": confidence,
    "volatility": volatility,
    "marketCap": market_cap,
}
insert_recommendation_outcome(conn, outcome_data)
```

#### 3. 銘柄分析API（StockAnalysis作成時）

StockAnalysis保存後にOutcomeを作成:

```python
outcome_data = {
    "type": "analysis",
    "recommendationId": analysis_id,
    "stockId": stock_id,
    "tickerCode": ticker_code,
    "sector": sector,
    "recommendedAt": analyzed_at,
    "priceAtRec": latest_price,
    "prediction": short_term_trend,  # "up" | "down" | "neutral"
    "confidence": confidence,
    "volatility": volatility,
    "marketCap": market_cap,
}
insert_recommendation_outcome(conn, outcome_data)
```

## 分析軸

Outcomeデータが溜まった後に、以下の軸で精度を検証できる。

### 条件別の精度分析

| 分析軸 | 切り方 | 問い |
|--------|--------|------|
| 信頼度別 | 0-0.3 / 0.3-0.6 / 0.6-1.0 | AIが自信ある時ほど本当に当たるか？ |
| セクター別 | sector でグループ化 | 得意/不得意な業種はあるか？ |
| ボラティリティ別 | 低(<20%) / 中(20-40%) / 高(>40%) | 安定銘柄と変動銘柄で精度差はあるか？ |
| 時価総額別 | 大型(1兆+) / 中型(1000億+) / 小型 | 銘柄規模で精度が変わるか？ |
| 予測種類別 | buy / stay / remove / up / down / neutral | どの判断が当たりやすいか？ |
| 時間枠別 | 1日後 / 3日後 / 7日後 / 14日後 | 短期と中期どちらの精度が高いか？ |
| vs 日経225 | returnAfter7Days - benchmarkReturn7Days | AI推薦は市場平均に勝っているか？ |

### 成功基準（現行踏襲）

現行の`generate_recommendation_report.py`と同じ基準を使用:

| 予測 | 成功条件 | 理由 |
|------|---------|------|
| buy / おすすめ | リターン > -3% | 大きく下がらなければ成功 |
| stay | リターン <= 5% | 見逃した急騰がなければ成功 |
| remove | リターン < 3% | 大きく上がらなければ成功 |
| up | リターン > -3% | 予測方向に概ね合っていれば成功 |
| down | リターン < 3% | 同上 |
| neutral | -5% <= リターン <= 5% | 大きく動かなければ成功 |

## UI拡張: `/ai-report`

既存の週次サマリー（タブ「概要」）はそのまま残し、新しいタブを追加。

### タブ構成

```
[概要]  [個別結果]  [条件別分析]
```

### タブ「個別結果」

推薦1件ごとの結果を一覧表示する。

```
フィルター: [全て ▼] [セクター ▼] [予測 ▼]
ソート:     [推薦日 ▼]

────────────────────────────────────
銘柄           予測    信頼度   1日後   7日後   14日後   vs日経
────────────────────────────────────
トヨタ(7203)   buy     0.72    +1.2%   +3.5%   +2.1%   +1.8%
ソニー(6758)   up      0.65    -0.5%   +2.8%    ---     ---
三菱UFJ(8306)  stay    0.80    +0.3%   -1.2%   -0.8%   -2.5%
任天堂(7974)   buy     0.55    -2.1%   -4.5%   -3.2%   -6.0%  ← 失敗
────────────────────────────────────
```

- リターンがまだ評価されていない箇所は `---` 表示
- 成功基準を満たさないセルは赤背景
- 銘柄名タップで `/stocks/[stockId]` へ遷移

### タブ「条件別分析」

条件別に成功率をまとめる。データが十分溜まったら（2週間〜）意味を持つ。

**信頼度キャリブレーション:**
```
信頼度      件数    成功率(7日後)   平均リターン
──────────────────────────────────────
低 (0-0.3)    12       58%          -1.2%
中 (0.3-0.6)  35       71%          +0.8%
高 (0.6-1.0)  28       82%          +2.1%
```

**セクター別:**
```
セクター          件数    成功率(7日後)   平均リターン   vs日経
────────────────────────────────────────────────
半導体・電子部品    18       78%          +2.5%        +1.2%
自動車             12       67%          +0.3%        -0.5%
医薬品              8       50%          -1.8%        -2.1%
```

**ベンチマーク比較:**
```
期間          AI推薦平均リターン   日経225リターン   超過リターン
──────────────────────────────────────────────────
直近1週間         +1.2%              +0.8%           +0.4%
直近2週間         +0.9%              +1.1%           -0.2%
直近4週間         +1.5%              +0.6%           +0.9%
```

## API設計

### GET `/api/reports/recommendation-outcomes`

個別推薦結果の取得。

```typescript
// クエリパラメータ
{
  type?: "daily" | "purchase" | "analysis"  // フィルタ
  sector?: string                           // セクターフィルタ
  days?: number                             // 直近N日（デフォルト: 30）
  limit?: number                            // 件数制限（デフォルト: 50）
}

// レスポンス
{
  outcomes: RecommendationOutcome[]
  summary: {
    totalCount: number
    successRate7Days: number | null
    avgReturn7Days: number | null
    benchmarkAvgReturn7Days: number | null
  }
}
```

### GET `/api/reports/recommendation-outcomes/analysis`

条件別分析データの取得。

```typescript
// クエリパラメータ
{
  days?: number  // 分析対象期間（デフォルト: 30）
}

// レスポンス
{
  byConfidence: { bucket: string, count: number, successRate: number, avgReturn: number }[]
  bySector: { sector: string, count: number, successRate: number, avgReturn: number, excessReturn: number }[]
  byPrediction: { prediction: string, count: number, successRate: number, avgReturn: number }[]
  byTimeHorizon: { horizon: string, successRate: number, avgReturn: number }[]
  benchmark: { period: string, aiReturn: number, benchmarkReturn: number, excess: number }[]
}
```

## 既存機能との関係

### `WeeklyAIReport`（既存）との住み分け

| | WeeklyAIReport | RecommendationOutcome |
|---|---|---|
| 粒度 | 週次の集計値 | 推薦1件ごと |
| 目的 | 全体トレンドの把握 | 個別の精度分析・原因調査 |
| 保持期間 | 長期（52週分） | 中期（直近90日程度で古いものは削除可） |
| 変更 | なし（そのまま維持） | 新規追加 |

WeeklyAIReportは「先週の成績」をサッと確認する用途で残す。
RecommendationOutcomeは「なぜ外したか」を掘り下げる用途。

### `generate_recommendation_report.py`（既存）

現行の週次レポート生成は変更しない。
Outcomeデータが溜まった段階で、週次レポートもOutcomeベースに切り替えることは可能だが、Phase 1では共存させる。

## 実装タスク

### Phase 1: データ基盤（まずデータを溜め始める）

1. Prismaスキーマに`RecommendationOutcome`テーブル追加
2. マイグレーション作成・適用
3. `generate_personal_recommendations.py` にOutcome作成を追加
4. `generate_purchase_recommendations.py` にOutcome作成を追加
5. 銘柄分析（StockAnalysis）作成時にOutcome作成を追加

### Phase 2: 評価バッチ

6. `evaluate_recommendation_outcomes.py` 作成（日次バッチ）
7. GitHub Actionsワークフロー `evaluate-outcomes.yml` 作成
8. Slack通知追加（成功・失敗）

### Phase 3: API・UI

9. `/api/reports/recommendation-outcomes` API作成
10. `/api/reports/recommendation-outcomes/analysis` API作成
11. `/ai-report` ページにタブ追加（個別結果・条件別分析）
12. スケルトンコンポーネント追加

## 注意事項

- Phase 1を先に入れてデータ蓄積を始めることが最優先。UIは2〜4週間後にデータが溜まってから作っても遅くない
- 既存の`WeeklyAIReport`や`generate_recommendation_report.py`は変更しない
- Outcome作成が失敗しても推薦自体の保存には影響させない（try-exceptで囲む）
- 古いOutcomeの削除は`cleanup_old_data.py`に追加（90日以上前を削除）
