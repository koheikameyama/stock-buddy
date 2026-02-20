# AIパフォーマンス改善案の実装計画

ユーザー様の分析に基づき、AIの銘柄選定および分析の精度とリスク管理を向上させるための具体的な修正を行います。

## ユーザーレビューが必要な項目

> [!IMPORTANT]
>
> - **ボラティリティの閾値変更**: 購入を制限する「高ボラティリティ」の基準を現行の **60%** から **50%** に引き下げることを提案します。
> - **予測の慎重化**: 直近の決算やトレンドを過信せず、あえて「逆のシナリオ（反落リスク）」を考慮させる指示をプロンプトに追加します。
> - **テクニカルの「騙し」対策**: チャートパターン単体での判断ではなく、出来高や市場全体の地合いとの相関をより重視させます。

## 提案される変更点

### 1. 銘柄選定基準の見直し（リスク管理の強化）

#### [MODIFY] [stock-safety-rules.ts](file:///Users/kouheikameyama/development/stock-buddy/lib/stock-safety-rules.ts)

- `HIGH_VOLATILITY_THRESHOLD` を `60` から `50` に引き下げます。
- 赤字かつ高ボラティリティな銘柄の「stay」判定をより確実なものにします。

### 2. 購入判断・テクニカル分析の見直し

#### [MODIFY] [purchase-recommendation-core.ts](file:///Users/kouheikameyama/development/stock-buddy/lib/purchase-recommendation-core.ts)

- プロンプトに以下を追加：
  - 「逆三尊やダブルボトムなどのパターンが検出されても、出来高が伴っていない場合は『騙し』のリスクを指摘せよ」
  - 「市場全体が下落基調にある場合、テクニカル的な買いシグナルより市場の地合いを優先して慎重に評価せよ」

### 3. 株価予測モデルの精度見直し（慎重な分析の導入）

#### [MODIFY] [purchase-recommendation-core.ts](file:///Users/kouheikameyama/development/stock-buddy/lib/purchase-recommendation-core.ts)

- プロンプトの価格帯予測指針を更新：
  - 「直近の好決算や上昇トレンドを無批判に延長せず、期待が織り込み済みである可能性を考慮せよ」
  - 「予測の確信度（confidence）を算出する際、不確実な要素（決算の持続性、地合いの不安定さ）を減点要素として扱え」

#### [MODIFY] [generate-daily/route.ts](file:///Users/kouheikameyama/development/stock-buddy/app/api/recommendations/generate-daily/route.ts)

- デイリーおすすめ生成用のプロンプトにも同様の「慎重性」と「騙しへの警戒」指示を追加します。

## 検証計画

### 手動検証

1. **ボラティリティ制限の動作確認**:
   - ボラティリティ 55% 前後の赤字銘柄を入力し、正常に `stay` へ補正されるか確認。
2. **AIフィードバックの質**:
   - チャートパターン発生中の銘柄に対し、出来高や地合いへの言及が追加されたかプロンプトの結果を確認。
3. **予測レンジの保守性**:
   - 以前より予測安値が広く取られているか、楽観的な予測が抑制されているかを確認。
