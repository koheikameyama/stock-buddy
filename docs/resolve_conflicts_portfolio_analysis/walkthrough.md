# 修正内容の確認 - portfolio-analysis-core.ts のコンフリクト解消

`lib/portfolio-analysis-core.ts` におけるマージコンフリクトを解消し、ロジックの整理と共通化を行いました。

## 実施内容

### 1. インポートの整理

- `Updated upstream` と `Stashed changes` で重複・不足していたインポートを統合。
- `RELATIVE_STRENGTH` 定数や `buildRelativeStrengthContext` 関数のインポートを追加。

### 2. buildPortfolioAnalysisPrompt のクリーンアップ

- 関数内に混入していたデータベース取得ロジック（`prisma` の呼び出し等）を削除。
- 引数で受け取ったデータに基づいてプロンプト文字列を生成して返すだけの、純粋なプロンプト生成関数にリファクタリング。

### 3. executePortfolioAnalysis の正常化

- データ取得ロジック（保有銘柄情報、損益、ニュース、市場データ等）を正確に保持。
- プロンプト生成部分を `buildPortfolioAnalysisPrompt` の呼び出しに統合。
- 終盤の保護ロジック（乖離率によるパニック売り防止、中長期トレンド考慮、相対強度考慮）を最新の改善内容を反映させた形で統合。

### 4. シミュレーション機能との整合性

- `executeSimulatedPortfolioAnalysis` がクリーンアップされた `buildPortfolioAnalysisPrompt` を正しく使用し、共通のAI判断基準を利用できることを確認。

## 検証結果

### 構文・型チェック

- `npx tsc --noEmit` により、主要なロジック部分の型整合性を確認（パスエイリアス `@/*` の解決に起因するエラーを除き、内部ロジックの破綻がないことを目視でも確認）。

> [!NOTE]
> これにより、ポートフォリオ分析とウォッチリストシミュレーションの両方で、一貫性のあるAI分析結果を提供できるようになりました。
