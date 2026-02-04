# シンプルRAGによるニュース統合機能 設計書

作成日: 2026-02-04

## 概要

MarketNewsテーブルに保存されたニュースデータをAI機能（チャット・注目銘柄生成）に統合する。シンプルなRAGアプローチ（SQL検索ベース）で実装し、ハルシネーション対策を徹底する。

## 目的

- AI分析の精度向上（最新ニュースを考慮）
- ハルシネーション対策（事実ベースの回答）
- 検証可能性の確保（ソースURL表示）
- ユーザー体験向上（文脈に合った回答）

## アーキテクチャ

### 全体フロー

```
ユーザーリクエスト（AIチャット or 注目銘柄生成）
↓
保有銘柄・ウォッチリストを取得
↓
getRelatedNews()で関連ニュースを取得
├─ 銘柄コード検索（content LIKE '%7203%'）
└─ なければセクター検索（sector = '自動車'）
↓
OpenAIプロンプトにニュースを追加
↓
AI分析・回答生成
↓
回答の最後に「参考ニュース」セクションを追加
```

### 新規追加モジュール

**`lib/news-rag.ts`**
- ニュース取得の共通関数
- AIチャット・注目銘柄生成の両方で使用
- ハルシネーション対策のフォーマット関数

### 修正するAPI

1. **`app/api/chat/route.ts`**
   - AIチャットにニュース統合
   - ユーザーの保有銘柄関連ニュースを参照

2. **`app/api/featured-stocks/generate/route.ts`**
   - 注目銘柄生成にニュース統合
   - 話題の銘柄を優先的に推奨

## ニュース取得ロジック

### 検索方法（ハイブリッド）

**優先度1: 銘柄コード検索**
```sql
WHERE content LIKE '%7203%'
  AND publishedAt >= (NOW() - INTERVAL '7 days')
ORDER BY publishedAt DESC
LIMIT 10
```

**優先度2: セクター検索（フォールバック）**
```sql
WHERE sector IN ('自動車', 'IT・サービス')
  AND publishedAt >= (NOW() - INTERVAL '7 days')
ORDER BY publishedAt DESC
LIMIT 10
```

### 取得範囲

- **期間**: 直近7日間
- **件数**: 最大10件（AIチャット）、最大20件（注目銘柄生成）
- **センチメント**: 全て（positive/neutral/negative）
- **ソート**: publishedAt DESC（新しい順）

### データ構造

```typescript
export interface NewsRAGParams {
  stockIds?: string[]        // 銘柄ID配列
  tickerCodes?: string[]     // 銘柄コード配列（例：["7203", "6758"]）
  sectors?: string[]         // セクター配列（例：["自動車", "IT・サービス"]）
  limit?: number            // 取得件数（デフォルト: 10）
  daysAgo?: number         // 何日前まで（デフォルト: 7）
}

export interface RelatedNews {
  id: string
  title: string
  content: string
  url: string | null
  source: string
  sector: string | null
  sentiment: string | null
  publishedAt: Date
  matchType: 'ticker' | 'sector'  // どの条件でマッチしたか
}
```

## ハルシネーション対策

### 1. プロンプトエンジニアリング

```typescript
const systemPrompt = `
あなたは投資初心者向けのアシスタントです。

【重要なルール】
1. 提供されたニュース情報のみを参照してください
2. ニュースにない情報は推測や創作をしないでください
3. 不確かな場合は「この情報は提供されたニュースにはありません」と明示してください
4. ニュースを引用する際は必ずソースとURLを示してください
5. 日付や数値は提供されたデータから正確に引用してください
6. 回答の最後には必ず参考にしたニュースを列挙してください

【最新ニュース】
${relatedNews.map(n => `
- タイトル: ${n.title}
- 日付: ${dayjs(n.publishedAt).format('YYYY-MM-DD')}
- センチメント: ${n.sentiment}
- 内容: ${n.content}
- URL: ${n.url}
`).join('\n')}
`
```

### 2. 構造化データの提供

- ニュースをJSON形式で明示的に提供
- タイトル、日付、URL、センチメントを構造化
- AIが参照しやすい形式

### 3. 検証可能性の確保

**回答フォーマット:**
```
[AI回答本文]

---
📰 参考にしたニュース:
• トヨタ、最高益を更新 (2026-02-01) - positive
  https://news.google.com/...
• 自動車業界、横ばい (2026-01-30) - neutral
  https://news.google.com/...
```

**実装:**
```typescript
export function formatNewsReferences(news: RelatedNews[]): string {
  if (news.length === 0) return ''

  return `\n\n---\n📰 参考にしたニュース:\n` +
    news.map(n =>
      `• ${n.title} (${dayjs(n.publishedAt).format('YYYY-MM-DD')}) - ${n.sentiment}\n  ${n.url || '(URLなし)'}`
    ).join('\n')
}
```

## AIチャット機能への統合

### 追加処理

```typescript
// 1. 保有銘柄・ウォッチリストから銘柄情報を抽出
const tickerCodes = [
  ...portfolioStocks.map(ps => ps.stock.tickerCode),
  ...watchlistStocks.map(ws => ws.stock.tickerCode)
]

const sectors = [
  ...new Set([
    ...portfolioStocks.map(ps => ps.stock.sector).filter(Boolean),
    ...watchlistStocks.map(ws => ws.stock.sector).filter(Boolean)
  ])
]

// 2. 関連ニュースを取得
const relatedNews = await getRelatedNews({
  tickerCodes,
  sectors,
  limit: 10,
  daysAgo: 7
})

// 3. システムプロンプトに追加
// 4. 回答の最後に参考ニュース追加
```

### ユーザー体験

**ビフォー:**
```
ユーザー: 「トヨタの株どう？」
AI: 「トヨタは安定した企業です...」（一般的な回答）
```

**アフター:**
```
ユーザー: 「トヨタの株どう？」
AI: 「トヨタの株は現在好調です。最新のニュースによると、
2026年度の業績が好調で最高益を更新する見込みです...」

---
📰 参考にしたニュース:
• トヨタ、最高益を更新 (2026-02-01) - positive
  https://news.google.com/...
```

## 注目銘柄生成への統合

### 追加処理

```typescript
// 1. 候補銘柄のセクターを集計
const candidateSectors = [
  ...new Set(candidateStocks.map(s => s.sector).filter(Boolean))
]

// 2. 候補銘柄に関連するニュースを取得
const relatedNews = await getRelatedNews({
  tickerCodes: candidateStocks.map(s => s.tickerCode),
  sectors: candidateSectors,
  limit: 20,  // 注目銘柄生成は多めに取得
  daysAgo: 7
})

// 3. OpenAIプロンプトに追加
const prompt = `
以下の候補銘柄から、今日の注目銘柄を3つ選定してください。

【候補銘柄】
${candidateStocks.map(s => `...`).join('\n')}

【最新の市場ニュース】
${relatedNews.map(n => `
- ${n.title} (${dayjs(n.publishedAt).format('MM/DD')})
  センチメント: ${n.sentiment}
  セクター: ${n.sector}
  内容: ${n.content.substring(0, 200)}...
`).join('\n')}

選定理由にニュースの情報を活用してください。
特にポジティブなニュースがある銘柄を優先してください。
`
```

### 効果

- 話題の銘柄を優先的に推奨
- ニュースベースの理由で説得力向上
- 市場トレンドを反映した選定

## エラーハンドリング

```typescript
export async function getRelatedNews(
  params: NewsRAGParams
): Promise<RelatedNews[]> {
  try {
    // ニュース取得処理
    const news = await prisma.marketNews.findMany({...})
    return news
  } catch (error) {
    console.error('Failed to fetch related news:', error)
    // エラー時は空配列を返す（AIチャットは継続可能）
    return []
  }
}
```

**方針:**
- ニュース取得失敗時もAI機能は継続
- エラーログを出力（後で調査可能）
- ユーザーには影響なし（通常のAI回答）

## パフォーマンス最適化

### データベースインデックス

既存のインデックスを活用：
- `publishedAt` の降順インデックス（既存）
- `sector` のインデックス（既存）

### クエリ最適化

```typescript
const news = await prisma.marketNews.findMany({
  where: {
    OR: [
      { content: { contains: tickerCode } },  // 銘柄コード検索
      { sector: { in: sectors } }              // セクター検索
    ],
    publishedAt: { gte: cutoffDate }
  },
  orderBy: { publishedAt: 'desc' },
  take: limit,
  select: {  // 必要なフィールドのみ取得
    id: true,
    title: true,
    content: true,
    url: true,
    source: true,
    sector: true,
    sentiment: true,
    publishedAt: true
  }
})
```

### レスポンス時間の目標

- ニュース取得: 100ms以内
- AIチャット全体: 3秒以内
- 注目銘柄生成: 30秒以内

## テスト・デプロイ

### ローカルテスト手順

```bash
# 1. ニュース取得関数のテスト
npm run test:news-rag

# 2. AIチャットで動作確認
# ブラウザで /dashboard にアクセス → チャット機能でニュースが表示されるか確認

# 3. 注目銘柄生成のテスト
python scripts/news/generate_featured_stocks.py
# ニュースが選定理由に含まれているか確認
```

### デプロイフロー

1. ローカルで実装・テスト
2. `git push origin main`
3. Railway自動デプロイ
4. 本番環境で動作確認

## コスト見積もり

### OpenAI APIトークン消費

**AIチャット:**
- ニュース追加: +500トークン/回
- コスト: 約$0.001/回
- 月間100回利用: 約$0.10/月

**注目銘柄生成:**
- ニュース追加: +2000トークン/回
- コスト: 約$0.004/回
- 毎日実行: 約$0.12/月

**合計追加コスト:** 約$0.50/月（想定利用量）

## 将来の拡張（フェーズ2）

### Mastra統合

- ベクトルDBでセマンティック検索
- より高度な関連性判定
- ニュースの要約・カテゴリ分類

### 追加機能

- ユーザーごとのニュース通知機能
- ニュースベースのアラート機能
- ニュースセンチメントのトレンド分析
- 銘柄別のニュースアーカイブ

### 段階的アプローチ

1. **フェーズ1（本設計）**: シンプルRAG実装
2. **フェーズ2**: 効果検証後にMastra導入を検討
3. **フェーズ3**: ユーザーフィードバックを基に機能拡張

## Stock Buddyコンセプトとの整合性

- **寄り添う**: 最新ニュースで文脈に合った回答
- **シンプル**: SQL検索ベースで複雑な技術不要
- **安心**: ソースURL表示で検証可能性確保
- **段階的**: フェーズ1で効果検証、フェーズ2で高度化
