# AIチャット 仕様書

## 概要

ユーザーが投資に関する質問をAIコーチに相談できるチャット機能です。ツール連携によりリアルタイムデータを取得して回答します。

## チャット機能

### 基本仕様

| 項目 | 値 |
|------|-----|
| モデル | GPT-4o-mini |
| Temperature | 0.7（会話的） |
| 最大トークン | 1024 |
| 最大ステップ | 10（ツール呼び出し反復） |
| SDK | Vercel AI SDK |

### ペルソナ

- 投資初心者向けのコーチ
- 専門用語を使いつつ、必ず解説を添える
- 親しみやすい口調
- 回答は300文字以内を目安

### コンテキスト

銘柄詳細ページから開いた場合、以下のデータをプリロード:
- 財務指標
- AI分析結果
- 関連ニュース
- ポートフォリオ分析（保有の場合）
- 購入判断（ウォッチリストの場合）

## ツール一覧

AIチャットは以下の8つのツールを使ってリアルタイムデータを取得します。

| ツール | 説明 | 取得データ |
|--------|------|-----------|
| `getPortfolioSummary` | ポートフォリオ概要 | 保有銘柄、現在価格、損益 |
| `getWatchlistSummary` | ウォッチリスト概要 | 注目銘柄、テクニカルデータ |
| `getStockFinancials` | 財務指標 | PBR, PER, ROE, 配当利回り, 52週高値/安値 |
| `getStockAnalysis` | AI予測 | 短期/中期/長期トレンド、推奨 |
| `getStockPrice` | リアルタイム株価 | 現在価格、変化率 |
| `getRelatedNews` | 関連ニュース | 直近5件、センチメント |
| `getPurchaseRecommendations` | 購入判断 | 7日以内の buy/stay/avoid |
| `getPortfolioAnalysis` | 保有分析 | 売り/ホールド判断 |
| `getDailyRecommendations` | 日次おすすめ | 今日のAI推奨5銘柄 |

## システムプロンプト構成

```
1. ペルソナ定義
2. 銘柄コンテキスト（特定銘柄ページからの場合）
3. プリロードされたデータ
4. マーケット概要（日経225）
5. ユーザーの投資スタイル・予算
6. 回答ルール
```

## API仕様

### `POST /api/chat`

**リクエストボディ**:
```json
{
  "messages": [
    { "role": "user", "content": "トヨタの今の株価は買い時？" }
  ],
  "stockContext": {
    "stockId": "xxx",
    "preloadedData": { ... }
  }
}
```

**レスポンス**: ストリーミングレスポンス（Vercel AI SDK形式）

**認証**: セッション認証

## 関連ファイル

- `app/api/chat/route.ts` - チャット API
- `lib/chat-tools.ts` - ツール定義
- `lib/prompts/chat-system-prompt.ts` - システムプロンプト構築
- `lib/openai.ts` - OpenAI クライアント
