# Walkthrough: AI分析ロジックの精緻化とステータス5段階化

AIによる株式分析の精度向上と、推奨アクションの明確化（5段階統一）を実装しました。

## 変更内容の概要

### 1. アクションステータスの5段階化と統一

既存の `statusType` 3段階（good/neutral/warning）を、日本語の明確な5段階アクションに刷新しました。

- **全力買い**: 非常に強い上昇シグナル
- **押し目買い**: 上昇トレンド中の健全な調整
- **ホールド**: 重要な節目や静観局面
- **戻り売り**: 下落トレンド中の一時的反発狙い
- **即時売却**: 損切りやトレンド崩壊

### 2. 計算済み特徴量の追加（テクニカル精緻化）

AIがより正確な判断をできるように、以下の特徴量を算出してプロンプトに提供するようにしました。

- **窓埋め（Gap Fill）判定**: 「落ちるナイフ」か「窓埋め後の反発」かの識別精度向上。
- **支持線・抵抗線の抽出改善**: より強固な節目（水平線）の特定。

### 3. AI思考プロセスの改善

システムプロンプトに「思考の優先順位」を導入しました。

1. トレンドの連続性判定
2. 短期と中期の予測矛盾の解消（一時的な調整かトレンド転換か）

## 修正ファイル一覧

### バックエンド・ロジック

- [constants.ts](file:///Users/kouheikameyama/development/stock-buddy/lib/constants.ts): 5段階ステータスの定義と色の設定。
- [technical-indicators.ts](file:///Users/kouheikameyama/development/stock-buddy/lib/technical-indicators.ts): 窓埋め判定・支持線抽出ロジック。
- [stock-analysis-context.ts](file:///Users/kouheikameyama/development/stock-buddy/lib/stock-analysis-context.ts): 特徴量のプロンプト用テキスト変換。
- [portfolio-analysis-core.ts](file:///Users/kouheikameyama/development/stock-buddy/lib/portfolio-analysis-core.ts): 「思考の優先順位」プロンプト、5段階ステータスのJSON Schema、シミュレーションロジックの同期。
- [schema.prisma](file:///Users/kouheikameyama/development/stock-buddy/prisma/schema.prisma): スキーマのクリーンアップ（一時フィールドの削除）。

### フロントエンド

- [StockAnalysisCard.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/components/StockAnalysisCard.tsx): 5段階ステータスに基づくアドバイスボックスの表示ロジック更新。

## 検証結果

- **型チェック・ビルド**: `npx prisma generate` を実行し、TypeScriptの lint エラー（変数の宣言漏れ、Schema不整合等）をすべて解消しました。
- **ロジック一貫性**: ポートフォリオ分析とウォッチリストのレコメンドの両方で、同じ5段階ステータス体系が適用されることを確認しました。

## ユーザーへの通知

> [!IMPORTANT]
> スキーマ変更を反映するため、デプロイ時に `npx prisma migrate dev` または `npx prisma db push` が必要です。

> [!TIP]
> 今後の分析では、AIが「窓埋め」や「支持線」を具体的に言及するようになり、より投資判断に直結するアドバイスが得られるようになります。
