# 銘柄詳細ページ & AIチャット機能

作成日: 2026-02-04

## 背景・目的

### 競合（みんかぶ）との差別化

現状のStock Buddyは「みんかぶの軽量版」に近い。コンセプト（初心者に寄り添う）は良いが、そのコンセプトを実現する機能がまだ薄い。

| 観点 | みんかぶ | Stock Buddy（現状） | Stock Buddy（目指す姿） |
|------|----------|---------------------|-------------------------|
| ポジション | 情報のデパート | 簡易情報サイト | パーソナルトレーナー |
| 強み | 情報量、コミュニティ | シンプル | 対話で寄り添う |
| AI活用 | 株価予想 | 分析表示 | 対話型コーチング |

### この機能で実現すること

1. **「AIコーチ」体験の具現化** - 分析を見せるだけでなく、対話で疑問に答える
2. **初心者の不安解消** - 「この株買っていい？」「なぜ下がった？」に即座に回答
3. **みんかぶにはない独自価値** - 情報量ではなく「関係性」で勝負

## 概要

### 実装する機能

**Phase 1: 銘柄詳細ページ + 銘柄チャット**
- `/stocks/[id]` ページを新規作成
- その銘柄に特化したAIチャット機能

**Phase 2: ダッシュボード汎用チャット**
- ダッシュボードに「投資について相談」チャットを追加
- マイ銘柄全体をコンテキストとした対話

## Phase 1: 銘柄詳細ページ + 銘柄チャット

### ページ構成

```
/stocks/[id]
├─ ヘッダー（銘柄名、ティッカー、現在価格）
├─ 価格チャート（簡易版）
├─ 基本情報
│   ├─ 保有情報（ポートフォリオの場合：数量、取得単価、損益）
│   └─ ウォッチリスト情報（アラート価格、追加理由）
├─ AI分析セクション
│   ├─ 株価予測（StockPrediction）
│   ├─ 購入判断（PurchaseRecommendation）※ウォッチリストのみ
│   └─ 売買判断（PortfolioAnalysis）※ポートフォリオのみ
└─ AIチャットセクション
    └─ 「この株について質問する」
```

### チャットUI設計

```
┌─────────────────────────────────────────────┐
│ 💬 この株について質問する                    │
├─────────────────────────────────────────────┤
│                                             │
│ [ユーザー] この株、今買っていい？            │
│                                             │
│ [AI] トヨタ自動車についてですね。           │
│ 現在の株価は2,850円で、あなたの購入価格     │
│ 2,700円から約5.5%上昇しています。           │
│                                             │
│ 短期的には...（続く）                       │
│                                             │
├─────────────────────────────────────────────┤
│ [入力欄: この株について質問...        ] [送信] │
│                                             │
│ 💡 よくある質問:                            │
│ ・今買うべき？  ・なぜ上がった？  ・売り時？ │
└─────────────────────────────────────────────┘
```

### チャットのコンテキスト

AIに渡す情報（システムプロンプト）:

```typescript
const systemPrompt = `
あなたは投資初心者向けのAIコーチです。
専門用語は使わず、中学生でも分かる言葉で説明してください。

## 対象銘柄
- 銘柄名: ${stock.name}
- ティッカー: ${stock.ticker}
- 現在価格: ${currentPrice}円
- 前日比: ${priceChange}%

## ユーザーの保有状況
${userHolding ? `
- 保有数量: ${userHolding.quantity}株
- 平均取得単価: ${userHolding.averagePurchasePrice}円
- 評価損益: ${unrealizedPL}円（${unrealizedPLPercent}%）
` : '- この銘柄は保有していません（ウォッチリスト）'}

## 直近のAI分析
${latestPrediction ? `
- 短期予測: ${latestPrediction.shortTermOutlook}
- 中期予測: ${latestPrediction.mediumTermOutlook}
- 長期予測: ${latestPrediction.longTermOutlook}
` : '- 分析データなし'}

## ユーザーの投資スタイル
- 投資期間: ${userSettings.investmentPeriod}
- リスク許容度: ${userSettings.riskTolerance}

## 回答のルール
1. 専門用語（PER、ROE、移動平均線など）は使わない
2. 「成長性」「安定性」「割安」など平易な言葉を使う
3. 断定的な表現は避け、「〜と考えられます」「〜の可能性があります」を使う
4. ユーザーの投資スタイルに合わせたアドバイスをする
5. 最終判断はユーザー自身が行うことを促す
`
```

### API設計

**POST /api/stocks/[id]/chat**

リクエスト:
```typescript
{
  message: string  // ユーザーの質問
  conversationHistory?: {
    role: 'user' | 'assistant'
    content: string
  }[]  // 会話履歴（直近5件程度）
}
```

レスポンス:
```typescript
{
  response: string  // AIの回答
  suggestedQuestions?: string[]  // 次の質問候補
}
```

### データベース変更

会話履歴を保存する場合（オプション）:

```prisma
model StockChatMessage {
  id        String   @id @default(cuid())
  userId    String
  stockId   String
  role      String   // 'user' | 'assistant'
  content   String
  createdAt DateTime @default(now())

  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  stock Stock @relation(fields: [stockId], references: [id], onDelete: Cascade)

  @@index([userId, stockId, createdAt])
}
```

**MVP案**: 会話履歴はセッション内のみ保持（DB保存なし）→ シンプルに始める

### 実装ファイル

**新規作成:**
1. `/app/stocks/[id]/page.tsx` - 銘柄詳細ページ（サーバーコンポーネント）
2. `/app/stocks/[id]/StockDetailClient.tsx` - クライアントコンポーネント
3. `/app/stocks/[id]/StockChat.tsx` - チャットUIコンポーネント
4. `/app/api/stocks/[id]/chat/route.ts` - チャットAPI

**変更:**
1. `/app/my-stocks/MyStocksClient.tsx` - カードクリックで詳細ページへ遷移
2. `/app/components/StockCard.tsx` - シンプル化（詳細は詳細ページへ）

## Phase 2: ダッシュボード汎用チャット

### UI設計

ダッシュボード右下にフローティングボタン:

```
┌─────────────────────────────────────────────┐
│ ダッシュボード                              │
│                                             │
│ [既存のコンテンツ]                          │
│                                             │
│                                             │
│                                             │
│                                     [💬]    │ ← フローティングボタン
└─────────────────────────────────────────────┘
```

クリックでチャットパネルが開く:

```
┌─────────────────────────────────────────────┐
│ 💬 投資について相談                     [×] │
├─────────────────────────────────────────────┤
│                                             │
│ [ユーザー] 今日、何か気をつけることある？   │
│                                             │
│ [AI] おはようございます！                   │
│ あなたの保有銘柄について、今日の注目点を    │
│ お伝えしますね。                            │
│                                             │
│ トヨタ自動車は決算発表が近いので...         │
│                                             │
├─────────────────────────────────────────────┤
│ [入力欄: 投資について相談...         ] [送信] │
│                                             │
│ 💡 よくある質問:                            │
│ ・今日の注目点は？ ・ポートフォリオどう？   │
└─────────────────────────────────────────────┘
```

### チャットのコンテキスト

```typescript
const systemPrompt = `
あなたは投資初心者向けのAIコーチです。

## ユーザーの保有銘柄
${portfolioStocks.map(s => `
- ${s.stock.name}（${s.stock.ticker}）
  - 保有: ${s.quantity}株
  - 取得単価: ${s.averagePurchasePrice}円
  - 現在価格: ${s.stock.currentPrice}円
  - 損益: ${unrealizedPL}円
`).join('')}

## ユーザーのウォッチリスト
${watchlistStocks.map(s => `
- ${s.stock.name}（${s.stock.ticker}）
  - 現在価格: ${s.stock.currentPrice}円
`).join('')}

## ユーザーの投資スタイル
- 投資期間: ${userSettings.investmentPeriod}
- リスク許容度: ${userSettings.riskTolerance}

## 回答のルール
（Phase 1と同様）
`
```

### API設計

**POST /api/chat**

リクエスト:
```typescript
{
  message: string
  conversationHistory?: {
    role: 'user' | 'assistant'
    content: string
  }[]
}
```

レスポンス:
```typescript
{
  response: string
  suggestedQuestions?: string[]
}
```

### 実装ファイル

**新規作成:**
1. `/app/components/GlobalChat.tsx` - フローティングチャットUI
2. `/app/api/chat/route.ts` - 汎用チャットAPI

**変更:**
1. `/app/dashboard/page.tsx` - GlobalChatコンポーネントを追加

## UI/UXの指針

### 初心者に寄り添うチャット体験

1. **即座に応答** - ローディング中も「考えています...」を表示
2. **質問を促す** - 「よくある質問」ボタンで気軽に始められる
3. **不安を和らげる** - 株価下落時は励ましのトーンで
4. **判断を押し付けない** - 「最終判断はあなた自身で」を常に添える

### やってはいけないこと

- 専門用語を使う
- 断定的な予測をする
- 投資を急かす
- リスクを軽視する

## 実装順序

### Phase 1（MVP）

1. **銘柄詳細ページの基本構造** - 既存コンポーネントを移植
2. **チャットAPI** - OpenAI API連携
3. **チャットUI** - シンプルな入力フォーム + メッセージ表示
4. **マイ銘柄からの導線** - カードクリックで詳細ページへ

### Phase 2

1. **フローティングチャットUI** - ダッシュボードに追加
2. **汎用チャットAPI** - マイ銘柄全体をコンテキストに
3. **UX改善** - 質問候補、会話履歴など

## コスト考慮

### OpenAI API使用量

- チャット1回あたり: 約500-1000トークン（入力） + 200-500トークン（出力）
- GPT-4o-mini使用時: 約$0.001-0.002/回
- GPT-4o使用時: 約$0.01-0.02/回

### 推奨

- **MVP**: GPT-4o-mini で開始（コスト重視）
- **将来**: 複雑な質問のみGPT-4oにルーティング

### 制限

- 1日あたりのチャット回数制限（例: 20回/日）
- 会話履歴は直近5件のみ保持（トークン削減）

## 成功指標

### 定量

- チャット利用率（DAU中のチャット利用者割合）
- 1セッションあたりのチャット回数
- 銘柄詳細ページの滞在時間

### 定性

- 「AIコーチに相談できて安心」というフィードバック
- 初心者が投資を始める/継続するきっかけになったか

## 将来の拡張案

1. **プッシュ通知連携** - 株価急変時にチャットで通知
2. **音声対話** - 「Hey Stock Buddy、トヨタどうなった？」
3. **学習コンテンツ連携** - 質問に応じて関連記事を提案
4. **感情分析** - ユーザーの不安度を検知して励ます
