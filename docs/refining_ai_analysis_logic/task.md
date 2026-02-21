# AI分析ロジックの精緻化

AIによる株式分析の精度と一貫性を向上させるため、プロンプトに「思考の優先順位」を明示し、アクションステータスを固定化し、さらに「窓埋め」や「支持線」などの計算済み特徴量をコンテキストとして提供します。

- [x] 実装計画の作成
  - [x] `task.md` の作成
  - [x] `implementation_plan.md` の作成
- [/] 計算済み特徴量の追加ロジック実装
  - [x] 窓埋め（Gap Fill）判定ロジック
  - [x] 支持線・抵抗線の抽出ロジック改善
  - [x] `lib/stock-analysis-context.ts` への反映
- [/] ステータス体系の5段階化・統一
  - [/] `lib/constants.ts` の定数更新
  - [/] `lib/portfolio-analysis-core.ts` のプロンプト更新
  - [ ] `app/components/StockAnalysisCard.tsx` の表示更新
- [ ] 検証と完了報告 [ ]
  - [ ] 動作確認
  - [ ] `walkthrough.md` の作成
