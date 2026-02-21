# AI分析ロジックの精緻化（ステータス統一・5段階化）

AIによる株式分析の精度向上と、ユーザーへの推奨アクションの明確化を行います。

## ユーザーレビューが必要な項目

- **ステータス体系の刷新**: 既存の `statusType` を以下の5段階に拡張・変更します。新しいフィールドは追加せず、既存の仕組みを強化します。
  1. **即時売却** (以前の warning / sell 相当)
  2. **戻り売り** (以前の warning / sell 相当・反発待ち)
  3. **ホールド** (以前の neutral 相当)
  4. **押し目買い** (以前の good / buy 相当)
  5. **全力買い** (以前の good / buy 相当・強い確信)

## Proposed Changes

### [Component] データ計算ロジック

#### [MODIFY] [technical-indicators.ts](file:///Users/kouheikameyama/development/stock-buddy/lib/technical-indicators.ts)

- 窓埋め（Gap Fill）判定および支持線・抵抗線抽出ロジックを追加（実装済み）。

### [Component] 定数と表示設定

#### [MODIFY] [constants.ts](file:///Users/kouheikameyama/development/stock-buddy/lib/constants.ts)

- `PORTFOLIO_STATUS_CONFIG` を上記5段階の日本語キーに更新し、それぞれの色・背景設定を定義します。

### [Component] UI表示

#### [MODIFY] [StockAnalysisCard.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/components/StockAnalysisCard.tsx)

- 新しい5段階の `statusType` に基づき、アドバイスボックス（買増・様子見・売却）の条件分岐を修正し、全てのステータスで適切なメッセージが表示されるようにします。

### [Component] AI分析コアロジック

#### [MODIFY] [portfolio-analysis-core.ts](file:///Users/kouheikameyama/development/stock-buddy/lib/portfolio-analysis-core.ts)

- プロンプトに「思考の優先順位」を追加。
- AIが `statusType` として上記5つから必ず1つ選択して出力するように指示。
- `executePortfolioAnalysis` での `statusType` 決定ロジックをAIの出力に委ねる形に更新。

#### [DELETE] [schema.prisma](file:///Users/kouheikameyama/development/stock-buddy/prisma/schema.prisma)

- 一時的に追加した `actionStatus` 等のフィールドは削除し、スキーマをクリーンに保ちます。

## Verification Plan

### 自動テスト

- 修正後のプロンプトでAIが「即時売却」〜「全力買い」のラベルを正しく返却することを確認。

### 手動検証

- 開発環境で各ステータスのデータを流し、UIのバッジ表示とアドバイスボックスの整合性を確認。
