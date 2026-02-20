# ウォッチリスト・シミュレーション機能の実装完了

ウォッチリスト詳細ページから、該当銘柄を100株保有した場合のポートフォリオ分析をシミュレーションする機能を実装しました。

## 変更内容

### バックエンド

- **[portfolio-analysis-core.ts](file:///Users/kouheikameyama/development/stock-buddy/lib/portfolio-analysis-core.ts)**:
  - プロンプト生成ロジックを `buildPortfolioAnalysisPrompt` として共通化しました。これにより、実際の分析とシミュレーションで同一のプロンプトを使用できるようになりました。
  - `executeSimulatedPortfolioAnalysis` 関数を実装し、DBに保存せずに最新株価を用いた詳細な分析結果のみを取得可能にしました。
- **[API Route](file:///Users/kouheikameyama/development/stock-buddy/app/api/stocks/[stockId]/simulated-portfolio-analysis/route.ts)**:
  - シミュレーション専用のAPIエンドポイント `/api/stocks/[stockId]/simulated-portfolio-analysis` を新設しました。

### フロントエンド

- **[StockAnalysisCard.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/components/StockAnalysisCard.tsx)**:
  - `isSimulation` プロパティを追加。シミュレーションモード時には専用のUI（ラベル、バッジ）を表示し、シミュレーション用APIを呼び出すように拡張しました。
- **[MyStockDetailClient.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/my-stocks/[id]/MyStockDetailClient.tsx)**:
  - ウォッチリスト表示において「100株保有時の影響を分析」ボタンを追加しました。
  - ボタン押下により、通常の「購入判断」の代わりに「AI売買判断（シミュレーション）」が表示されます。

## 検証結果

- [x] ウォッチリスト詳細画面にシミュレーション開始ボタンが表示されること
- [x] ボタン押下でシミュレーションモードの分析カードが表示されること
- [x] シミュレーション分析結果が実際のポートフォリオ分析と同じフォーマットで返されること
- [x] 「シミュレーションを終了」ボタンで元の購入判断に戻ること

> [!NOTE]
> シミュレーション分析はDBに保存されないため、何度でも実行可能です。
