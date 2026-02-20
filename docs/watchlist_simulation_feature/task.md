# タスクリスト - ウォッチリスト詳細でのポートフォリオ分析シミュレーション

## 準備

- [x] 1. 📝 実装計画の作成と承認
- [x] 2. 📝 `task.md` の作成

## 実装 - バックエンド

- [x] 3. ⚙️ プロンプト生成ロジックの共通化 `lib/portfolio-analysis-core.ts`
  - [x] `buildPortfolioAnalysisPrompt` 関数の抽出
- [x] 4. ⚙️ シミュレーション用分析ロジックの追加 `lib/portfolio-analysis-core.ts`
  - [x] `executeSimulatedPortfolioAnalysis` 関数の実装（共通プロンプトを使用、DB保存なし）
- [x] 5. 🚀 シミュレーション用APIエンドポイントの作成 `app/api/stocks/[stockId]/simulated-portfolio-analysis/route.ts`

## 実装 - フロントエンド

- [x] 6. 🎨 `StockAnalysisCard.tsx` の修正
  - [x] シミュレーションモードのサポート（props追加、API呼び出し先の切り替え）
- [x] 7. 📱 `MyStockDetailClient.tsx` の修正
  - [x] ウォッチリスト表示時に「100株でシミュレーション」ボタンまたはトグルを追加
  - [x] シミュレーション状態の管理

## 検証

- [x] 8. ✅ 動作確認
  - [x] ウォッチリストの詳細ページでシミュレーションが正しく動作すること
  - [x] DBに不要なデータが保存されていないこと
- [x] 9. 📝 完了ドキュメントの作成 `walkthrough.md`
