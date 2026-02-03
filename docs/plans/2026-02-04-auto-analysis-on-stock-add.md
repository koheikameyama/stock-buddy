# マイ銘柄追加時の自動分析生成機能

作成日: 2026-02-04

## 概要

ユーザーがマイ銘柄（ウォッチリストまたはポートフォリオ）に銘柄を追加した際、自動的に以下の分析を生成する機能を実装します。

### 自動生成される分析

**ウォッチリスト追加時:**
- 株価予測（StockPrediction）
- 購入推奨（PurchaseRecommendation）

**ポートフォリオ追加時:**
- 株価予測（StockPrediction）
- ポートフォリオ分析（PortfolioAnalysis：売買判断）

## アーキテクチャ

### パターン: 非同期処理 + ポーリング方式

```
ユーザー操作 → 銘柄追加API → すぐにレスポンス
                    ↓
              バックグラウンドで分析生成開始
                    ↓
フロントエンド ← ポーリング（3秒間隔） → 分析確認API
     ↓
分析完了を検知 → UI更新
```

### 主要コンポーネント

1. **`/api/user-stocks`** (既存・拡張)
   - 銘柄追加処理
   - レスポンス後に分析生成APIを非同期呼び出し

2. **`/api/stocks/[stockId]/generate-analyses`** (新規)
   - バックグラウンドで分析生成
   - 既存の分析APIを内部的に呼び出し

3. **フロントエンドコンポーネント** (拡張)
   - StockPrediction.tsx
   - PurchaseRecommendation.tsx
   - PortfolioAnalysis.tsx
   - ポーリングロジックとUI状態管理を追加

## データフロー

### 1. 銘柄追加時（POST /api/user-stocks）

```typescript
// 既存のロジック
1. バリデーション
2. 銘柄をWatchlistStock or PortfolioStockに追加
3. レスポンスを返す（200ms程度）

// 追加ロジック
4. レスポンス後、内部的に分析生成APIを呼び出し（await不要）
   fetch(`/api/stocks/${stockId}/generate-analyses`, {
     method: 'POST',
     body: JSON.stringify({
       type: 'watchlist' | 'portfolio',
       userId
     })
   }).catch(err => console.error('Failed to trigger analysis:', err))
```

### 2. バックグラウンド分析生成（POST /api/stocks/[stockId]/generate-analyses）

```typescript
// type='watchlist' の場合
try {
  // 1. 株価予測生成 (5-10秒)
  await fetch(`/api/stocks/${stockId}/predictions`, {
    method: 'POST'
  })

  // 2. 購入推奨生成 (5-10秒)
  await fetch(`/api/stocks/${stockId}/purchase-recommendation`, {
    method: 'POST'
  })
} catch (error) {
  // エラーログ出力のみ、DBには保存しない（nullのまま）
  console.error('Analysis generation failed:', error)
}

// type='portfolio' の場合
try {
  // 1. 株価予測生成 (5-10秒)
  await fetch(`/api/stocks/${stockId}/predictions`, {
    method: 'POST'
  })

  // 2. ポートフォリオ分析生成 (5-10秒)
  await fetch(`/api/stocks/${stockId}/portfolio-analysis`, {
    method: 'POST',
    body: JSON.stringify({ userId })
  })
} catch (error) {
  console.error('Analysis generation failed:', error)
}
```

### 3. フロントエンド ポーリング

```typescript
// StockPrediction.tsx
const [analysisState, setAnalysisState] = useState<'loading' | 'loaded' | 'error'>('loading')
const [retryCount, setRetryCount] = useState(0)

useEffect(() => {
  if (existingAnalysis) {
    setAnalysisState('loaded')
    return
  }

  let elapsedTime = 0
  const interval = setInterval(async () => {
    elapsedTime += 3000

    try {
      const response = await fetch(`/api/stocks/${stockId}/predictions`)
      const data = await response.json()

      if (data.prediction) {
        setAnalysisState('loaded')
        clearInterval(interval)
      }
    } catch (error) {
      console.error('Polling error:', error)
    }

    // 60秒でタイムアウト
    if (elapsedTime >= 60000) {
      setAnalysisState('error')
      clearInterval(interval)
    }
  }, 3000)

  return () => clearInterval(interval)
}, [stockId, existingAnalysis, retryCount])

// 再試行
const handleRetry = () => {
  setAnalysisState('loading')
  setRetryCount(prev => prev + 1)

  // 分析生成を再実行
  fetch(`/api/stocks/${stockId}/generate-analyses`, {
    method: 'POST',
    body: JSON.stringify({ type: 'watchlist' })
  })
}
```

## UI/UX設計

### 初期状態（分析なし）

```
┌─────────────────────────┐
│ 📊 株価予測            │
│                         │
│ 🔄 分析中...           │
│                         │
└─────────────────────────┘

┌─────────────────────────┐
│ 💡 購入推奨            │
│                         │
│ 🔄 分析中...           │
│                         │
└─────────────────────────┘
```

### タイムアウト時（60秒経過）

```
┌─────────────────────────┐
│ 📊 株価予測            │
│                         │
│ ⚠️ 分析生成に失敗      │
│ しました               │
│                         │
│ [再試行]ボタン         │
└─────────────────────────┘
```

### 分析完了時

通常の分析結果を表示（既存のStockPredictionコンポーネント等）

## エラーハンドリング

### 1. 分析生成API失敗（サーバー側）

- 各分析ごとにtry-catchで捕捉
- エラーログを出力
- DBには保存しない（nullのまま）
- ポーリングで「分析なし」が続く → 60秒後にタイムアウト表示

### 2. ポーリングタイムアウト（クライアント側）

- 60秒経過しても分析がnullの場合
- 「分析生成に失敗しました」メッセージ表示
- 「再試行」ボタンで分析生成APIを再実行

### 3. ネットワークエラー

- fetch失敗時は次のポーリングを継続
- 最終的に60秒でタイムアウト

## 実装ファイル

### 新規作成

1. `/app/api/stocks/[stockId]/generate-analyses/route.ts`
   - バックグラウンド分析生成API
   - 既存の分析APIを内部的に呼び出し

### 変更ファイル

1. `/app/api/user-stocks/route.ts`
   - POST処理の最後に分析生成APIを非同期呼び出し
   - `fetch()` でfire-and-forget

2. `/app/components/StockPrediction.tsx`
   - ポーリングロジック追加
   - 「分析中...」「エラー表示」「再試行ボタン」

3. `/app/components/PurchaseRecommendation.tsx`
   - 同様のポーリングロジック追加

4. `/app/components/PortfolioAnalysis.tsx`
   - 同様のポーリングロジック追加

## 実装順序

1. バックグラウンド分析生成API作成
2. 銘柄追加APIに非同期呼び出しを追加
3. 各コンポーネントにポーリングロジック追加
4. エラーハンドリングとUI調整
5. テストと調整

## テスト計画

### 手動テスト

1. **ウォッチリスト追加**
   - 銘柄追加後、3秒以内に分析が表示されるか
   - 株価予測と購入推奨の両方が生成されるか

2. **ポートフォリオ追加**
   - 銘柄追加後、3秒以内に分析が表示されるか
   - 株価予測とポートフォリオ分析の両方が生成されるか

3. **OpenAI APIエラー時**
   - 60秒後にエラー表示されるか
   - 再試行ボタンが動作するか

4. **エッジケース**
   - 分析生成中にページリロードしても問題ないか
   - 複数銘柄を連続追加しても問題ないか
   - ネットワーク切断時の挙動

### 確認ポイント

- OpenAI APIのコスト増加は許容範囲か
- サーバー負荷（3秒間隔のポーリング）は問題ないか
- UX: ユーザーは待ち時間を理解できるか

## 制約・考慮事項

### パフォーマンス

- 分析生成には10-20秒かかる（OpenAI API呼び出し）
- ポーリング間隔: 3秒（サーバー負荷とUXのバランス）
- タイムアウト: 60秒（OpenAI APIの通常応答時間を考慮）

### コスト

- 銘柄追加ごとにOpenAI API呼び出しが発生
- ウォッチリスト: 2回（予測 + 購入推奨）
- ポートフォリオ: 2回（予測 + ポートフォリオ分析）

### セキュリティ

- 分析生成APIは内部呼び出しのみ（認証不要でも問題なし）
- または、同じ認証トークンを使用して内部呼び出し

## 将来の拡張案

- WebSocket or SSEによるリアルタイム通知（ポーリング不要）
- バックグラウンドジョブキュー（Vercel Queueなど）
- 分析生成の優先度制御
- キャッシュ機構（同じ銘柄の再生成を防ぐ）
