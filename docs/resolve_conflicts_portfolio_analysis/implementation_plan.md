# 実装計画 - portfolio-analysis-core.ts のコンフリクト解消

`lib/portfolio-analysis-core.ts` におけるマージコンフリクトを解消し、ウォッチリストシミュレーション機能のためのリファクタリングを正しく完了させます。

## 現状の課題

- インポート部分にコンフリクトが発生している。
- `buildPortfolioAnalysisPrompt` 内に `executePortfolioAnalysis` のロジックが誤って混入している。
- `executePortfolioAnalysis` 内の保護ロジック（パニック売り防止、トレンド考慮等）に重複や矛盾のあるコンフリクトマーカーが残っている。

## 修正方針

### 1. インポートの整理

- `Updated upstream` と `Stashed changes` の両方で必要なインポートを統合します。
- 特に `RELATIVE_STRENGTH` や `MA_DEVIATION` などの新しく追加された定数や、`buildRelativeStrengthContext` などのコンテキストビルド関数を漏れなく含めます。

### 2. buildPortfolioAnalysisPrompt のクリーンアップ

- この関数は「純粋なプロンプト生成関数」とします。
- 内部に混入した `prisma` 呼び出しやデータ取得ロジックを削除し、引数で受け取ったデータをもとにプロンプト文字列を返すだけの状態にします。

### 3. executePortfolioAnalysis の修正

- データ取得ロジック（`portfolioStock` の取得、損益計算、ニュース・市場データ取得など）を正確に保持します。
- プロンプト生成部分を `buildPortfolioAnalysisPrompt` の呼び出しに差し替えます。
- 終盤の保護ロジック（パニック売り防止、中長期トレンド考慮、相対強度考慮）を最新の状態（`Stashed changes` 側が最新の改善と思われるので、そちらをベースにしつつ `Updated upstream` の内容を取り込む）に修正します。

### 4. executeSimulatedPortfolioAnalysis の確認

- シミュレーション用関数が `buildPortfolioAnalysisPrompt` を正しく使用していることを確認します。

## 検証計画

- 構文エラーがないことを確認。
- 型定義に不整合がないことを確認。

> [!NOTE]
> 今回はコンフリクト解消のみを目的とし、ロジック自体の大きな変更は行いません。
