# 統合分析プロンプト設計書

**作成日**: 2026-02-18
**ステータス**: 確定（2026-02-18）

---

## 背景と課題

### 問題

ウォッチリストで「買い推奨」だった銘柄をポートフォリオに追加すると、すぐ「様子見」や「売り推奨」になるケースがある。

### 根本原因

ポートフォリオ分析とウォッチリスト分析で、**渡しているデータと評価の視点が異なる**。

| 項目 | ウォッチリスト分析 | ポートフォリオ分析 |
|------|------------------|------------------|
| RSI / MACD | ✅ 渡している | ❌ 渡していない |
| ローソク足パターン | ✅ 渡している | ❌ 渡していない |
| チャートパターン | ✅ 渡している | ❌ 渡していない |
| 財務指標 | ✅ | ✅ |
| ニュース | ✅ | ✅ |
| 市場コンテキスト | ✅ | ✅ |
| プロンプトの視点 | 「購入判断をしてください」 | 「売買判断と感情コーチング」 |
| 出力 | buy / stay / avoid | good / neutral / caution / warning |

同じ日・同じ株・同じ市場状況でも、テクニカル指標の有無と問いかけ方の違いで結論がブレる。

---

## 設計方針

### 基本思想

**「市場の評価軸を統一し、表示だけを文脈に合わせる」**

1. テクニカル指標・財務指標・ニュースをすべて同じデータで評価する
2. LLMが出力する **共通の市場シグナル** (`marketSignal`) を軸に据える
3. ウォッチリスト表示とポートフォリオ表示は、同じシグナルから導く

### 採用しないアプローチ

- **完全な単一プロンプト統合はしない**: ウォッチリスト（「買うべきか？」）とポートフォリオ（「持ち続けるべきか？」）は本質的に別の問いのため、1つに詰め込むとどちらも精度が落ちる可能性がある

---

## 実装計画

### Phase 1: データ入力の統一（最優先）

**目的**: テクニカル指標をポートフォリオ分析に追加し、同じデータで評価できるようにする

**変更ファイル**: `app/api/stocks/[stockId]/portfolio-analysis/route.ts`

追加するデータ（現在ウォッチリスト分析のみ渡している）：
- ローソク足パターン分析（`patternContext`）
- RSI / MACD（`technicalContext`）
- チャートパターン（`chartPatternContext`）
- 週間変化率（`weekChangeContext`）

これだけで大半の不整合は解消される見込み。

### Phase 2: 共通の市場シグナルを出力に追加

**目的**: 評価軸を明示的に統一し、両方の出力を整合させる

#### ポートフォリオ分析の出力に追加

```json
{
  "marketSignal": "bullish" | "neutral" | "bearish",
  // 既存フィールドは維持
  "shortTerm": "...",
  "emotionalCoaching": "...",
  "simpleStatus": "好調 | 様子見 | 注意 | 警戒",
  "statusType": "good | neutral | caution | warning"
}
```

#### ウォッチリスト分析の出力に追加

```json
{
  "marketSignal": "bullish" | "neutral" | "bearish",
  // 既存フィールドは維持
  "recommendation": "buy | stay | avoid",
  "confidence": 0.0,
  "reason": "..."
}
```

#### marketSignal と既存フィールドの対応関係

| marketSignal | ウォッチリスト (recommendation) | ポートフォリオ (statusType) |
|-------------|-------------------------------|--------------------------|
| bullish | buy | good |
| neutral | stay | neutral |
| bearish | avoid | caution / warning |

#### DBスキーマ変更

**`PurchaseRecommendation` テーブルに追加**:
```prisma
marketSignal String? // "bullish" | "neutral" | "bearish"
```

**`PortfolioStock` テーブルに追加**:
```prisma
marketSignal String? // "bullish" | "neutral" | "bearish"
```

### Phase 3: ポートフォリオ判断の補正ルールを整理（必要に応じて）

現在のポートフォリオ分析には以下のような独自ルールがある：

```typescript
// 購入後3日間は売り推奨を抑制
if (daysSincePurchase <= PORTFOLIO_ANALYSIS.RECENT_PURCHASE_DAYS) {
  // recommendation は原則 hold
}

// 含み損-15%以上は損切りを提案
if (profitPercent <= PORTFOLIO_ANALYSIS.FORCE_SELL_LOSS_THRESHOLD) {
  // 損切りを選択肢として提示
}
```

これらは **ポートフォリオ固有の文脈** であり、市場シグナルとは独立して適用する。
`marketSignal=bullish` でも含み損が大きければ損切り提案はあり得る。

---

## プロンプト設計（Phase 2 後）

### ポートフォリオ分析プロンプト（変更後）

```
あなたは投資初心者向けのAIコーチです。
以下の保有銘柄について、売買判断と感情コーチングを提供してください。
テクニカル分析の結果を活用し、専門用語は解説を添えて使ってください。

【銘柄情報】
...（変更なし）...

【テクニカル指標】   ← NEW: 追加
...RSI, MACD, ローソク足, チャートパターン...

【株価データ・ニュース・市場】
...（変更なし）...

【回答形式】
{
  "marketSignal": "bullish" | "neutral" | "bearish",  ← NEW
  "shortTerm": "...",
  "mediumTerm": "...",
  "longTerm": "...",
  ...（既存フィールドは維持）...
}

【市場シグナルの定義】  ← NEW
- bullish: テクニカル・ファンダメンタル総合で上昇優勢
- neutral: どちらとも言えない、横ばい
- bearish: 下落優勢、リスクが高い
```

### ウォッチリスト分析プロンプト（変更後）

```
...（変更なし）...

【回答形式】
{
  "marketSignal": "bullish" | "neutral" | "bearish",  ← NEW
  "recommendation": "buy" | "stay" | "avoid",
  ...（既存フィールドは維持）...
}
```

---

## 表示コンポーネントへの影響

### `StockAnalysisCard.tsx`（ポートフォリオ表示）

- 変更なし（既存フィールドをそのまま表示）
- `marketSignal` は内部整合性チェックに利用可能（将来的に）

### `PurchaseRecommendation.tsx`（ウォッチリスト表示）

- 変更なし（既存フィールドをそのまま表示）

---

## バッチスクリプトへの影響

| スクリプト | 影響 |
|-----------|------|
| `scripts/github-actions/generate_portfolio_analysis.py` | 変更なし（APIを呼ぶだけ） |
| `scripts/github-actions/generate_purchase_recommendations.py` | 変更なし（APIを呼ぶだけ） |

---

## 実装順序

```
Phase 1: テクニカル指標をポートフォリオ分析に追加
  → app/api/stocks/[stockId]/portfolio-analysis/route.ts を変更
  → プロンプトにpatternContext, technicalContext, chartPatternContextを追加
  → 効果検証

Phase 2: marketSignal を両プロンプトの出力に追加
  → prisma/schema.prisma に marketSignal フィールドを追加
  → マイグレーション作成
  → 両ルートのJSON Schemaと出力処理を更新

Phase 3: 必要に応じて追加の整合性チェックを実装
```

---

## Phase 4: プロンプト全体の設計思想を変更（追加要件）

### 背景

ユーザーフィードバック:
> 「感情コーチングじゃなくて、〇〇な理由で下落してますが△△な理由で様子見でいいです、みたいに全てにおいて具体的な理由を添えてほしい」

### 現状の問題

出力が「励まし」か「判断の結論」のどちらかに寄っており、**理由と判断がセットになっていない**。

```
// 悪い例①: 感情コーチング（理由なし）
emotionalCoaching: "下落していますが焦る必要はありません。長期的な視点を持ちましょう。"

// 悪い例②: 結論だけ（理由なし）
shortTerm: "今週は様子見が推奨されます。"

// 悪い例③: 理由だけ（判断なし）
shortTerm: "RSIが売られすぎ水準です。MACDも下降傾向にあります。"
```

### 変更方針: 全出力で「理由 → 判断」を必須にする

**すべてのテキストフィールドを「〇〇な理由で→△△です」の形式に統一する。**

```
// 良い例①: 理由 + 様子見判断
"RSI（売られすぎ・買われすぎの指標）が28と売られすぎ水準ですが、
 先週の決算発表で営業利益が市場予想を下回ったことが嫌気されています。
 ただし日経225は回復傾向にあるため、今は様子見でいいでしょう。"

// 良い例②: 理由 + 売却判断
"MACDがデッドクロス（下降転換のシグナル）を示しており、
 先週比-15%と急落しています。損切りラインに近づいているため、
 売却を検討しましょう。"

// 良い例③: 理由 + 買い増し判断
"ダブルボトム（2回底を打って反転する買いパターン）が出現し、
 RSIも底打ちの兆候があります。決算も好調だったため、
 押し目買いのチャンスかもしれません。"
```

### フィールドごとの変更方針

| フィールド | 変更前の指示 | 変更後の指示 |
|-----------|------------|------------|
| `shortTerm` | 「今週の予測を2-3文で」 | 「テクニカル・ニュース等の具体的根拠を挙げた上で、今週の判断（様子見/買い増し検討/売却検討）を示す」 |
| `mediumTerm` | 「今月の見通しと推奨行動を」 | 「ファンダメンタル・中期トレンドの根拠を挙げた上で、今月の判断を示す」 |
| `longTerm` | 「3ヶ月の成長性と継続判断を」 | 「事業展望・財務状況の根拠を挙げた上で、長期継続の判断を示す」 |
| `emotionalCoaching` | 「気持ちに寄り添うメッセージ」| **削除**: 理由付き判断で代替する |
| `sellReason` | 「売却理由を」 | 「具体的なシグナルや指標名を挙げて売却理由を説明する」 |
| `buyCondition` | 「買い条件を」 | 「どの指標が何の水準になったら買うか具体的に示す」 |

### フィールドの変更（DB）

`emotionalCoaching` を削除し、各フィールドの中に理由を埋め込む方式に変更。

```diff
// prisma/schema.prisma
- emotionalCoaching String? @db.Text
// 削除: shortTerm/mediumTerm/longTerm の中で理由+判断を表現する
```

```sql
-- マイグレーション
ALTER TABLE "PortfolioStock" DROP COLUMN "emotionalCoaching";
```

### プロンプト変更（ポートフォリオ分析）

```diff
- あなたは投資初心者向けのAIコーチです。売買判断と感情コーチングを提供してください。
+ あなたは投資初心者向けのAIアナリストです。
+ すべての判断に「なぜそう判断するか」の具体的な根拠を必ず添えてください。
+
+ 【絶対ルール】
+ - 「焦らないで」「大丈夫です」などの感情的な励ましは書かない
+ - 必ずテクニカル指標・ニュース・市場環境のいずれかを根拠として挙げる
+ - 「〇〇な理由で→△△な判断」の形式を必ず守る
+ - 専門用語を使う場合は括弧内に解説を添える（例: RSI（売られすぎ・買われすぎの指標））

- "emotionalCoaching": "ユーザーの気持ちに寄り添うメッセージ",
+ // フィールド削除: shortTerm/mediumTerm/longTerm の中で理由+判断を表現する

- "shortTerm": "短期予測を2-3文で",
+ "shortTerm": "テクニカル・ニュース等の具体的根拠を挙げた上で今週の判断（様子見/買い増し検討/売却検討）を2-3文で。必ず根拠→判断の順で書く",

- "mediumTerm": "中期予測を2-3文で",
+ "mediumTerm": "ファンダメンタル・中期トレンドの根拠を挙げた上で今月の判断を2-3文で。必ず根拠→判断の順で書く",

- "longTerm": "長期予測を2-3文で",
+ "longTerm": "事業展望・財務状況の根拠を挙げた上で長期継続の判断を2-3文で。必ず根拠→判断の順で書く",
```

### 変更が必要なファイル

| ファイル | 変更内容 |
|---------|---------|
| `prisma/schema.prisma` | `emotionalCoaching` フィールドを削除 |
| `app/api/stocks/[stockId]/portfolio-analysis/route.ts` | プロンプト全体を「理由+判断」方式に書き直し、JSON Schemaから `emotionalCoaching` を除去 |
| `app/components/StockAnalysisCard.tsx` | `emotionalCoaching` の表示箇所を削除 |

---

## 見送り事項

以下は今回の設計に含めない：

- **単一プロンプトへの完全統合**: 評価の文脈が異なるため、分けたまま評価軸だけ統一する
- **DBテーブルの統合**: 既存の `PurchaseRecommendation` と `PortfolioStock` は用途が異なり維持する

---

## 未決定事項

- [ ] Phase 1 の効果を検証してから Phase 2 に進むか、一気にやるか
- [ ] `marketSignal` を UI に表示するか、内部整合性チェックのみに使うか
- [x] `shortTerm` / `mediumTerm` / `longTerm` のフォーマットを「根拠→判断」で固定する（強制）
