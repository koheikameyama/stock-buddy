# 管理画面 仕様書

## 概要

管理者向けの銘柄マスタ管理画面です。株価取得失敗の監視や上場廃止ステータスの管理を行います。

**ページパス**: `/admin`

**認証**: admin ロールのみアクセス可能

## 画面構成

### フィルター

| フィルター | 説明 |
|-----------|------|
| すべて | 全銘柄一覧 |
| 取得失敗 | fetchFailCount が閾値以上の銘柄 |
| 上場廃止 | isDelisted = true の銘柄 |

### 検索

証券コードまたは銘柄名で検索（大文字小文字区別なし）。

### 銘柄一覧テーブル

| カラム | 説明 |
|--------|------|
| 証券コード | ティッカーコード |
| 銘柄名 | 正式名称 |
| 市場 | 東証プライム等 |
| 最新株価 | 直近の価格 |
| 取得失敗回数 | 連続失敗回数 |
| ステータスバッジ | 上場廃止 / 取得失敗中 |
| ユーザー数 | ポートフォリオ + ウォッチリスト + 追跡の合計 |

### ソート

1. 取得失敗回数（降順）
2. 証券コード（昇順）

### アクション

- 上場廃止ステータスの切替

## API仕様

### `GET /api/admin/stocks`

**クエリパラメータ**:
- `page`: ページ番号
- `limit`: 取得件数（最大100）
- `search`: 検索キーワード
- `filter`: `all` / `failed` / `delisted`

**レスポンス**:
```json
{
  "stocks": [
    {
      "id": "xxx",
      "tickerCode": "7203.T",
      "name": "トヨタ自動車",
      "market": "東証プライム",
      "latestPrice": 2800,
      "latestVolume": 15000000,
      "fetchFailCount": 0,
      "lastFetchFailedAt": null,
      "isDelisted": false,
      "priceUpdatedAt": "2026-02-22T06:30:00Z",
      "userCount": 15
    }
  ],
  "total": 1500,
  "page": 1,
  "limit": 50
}
```

**認証**: admin ロール

### `PATCH /api/admin/stocks/[stockId]`

上場廃止ステータスを切替。

**リクエストボディ**:
```json
{
  "isDelisted": true
}
```

**副作用**: 上場廃止解除時に `fetchFailCount` と `lastFetchFailedAt` をリセット

**認証**: admin ロール

## 銘柄追加リクエスト管理

ユーザーからの銘柄追加リクエストの確認・承認。

### StockRequest ステータス

| ステータス | 説明 |
|-----------|------|
| pending | 審査待ち |
| approved | 承認済み |
| rejected | 却下 |
| added | 銘柄マスタに追加済み |

## 監視指標

### 株価取得失敗

- `fetchFailCount`: 連続失敗回数
- `lastFetchFailedAt`: 最後に失敗した日時
- 閾値超過時に警告バッジ表示
- 連続失敗が続く場合は上場廃止の可能性

### 上場廃止銘柄

- `isDelisted = true` の銘柄は株価取得がスキップされる
- AI分析でも強制的に「売却」推奨になる
- ユーザーの保有画面では薄く表示、操作制限あり

## 関連ファイル

- `app/admin/page.tsx` - 管理画面ページ
- `app/admin/AdminStocksClient.tsx` - 銘柄管理コンポーネント
- `app/api/admin/stocks/route.ts` - 銘柄一覧 API
- `app/api/admin/stocks/[stockId]/route.ts` - 銘柄更新 API
- `lib/auth-utils.ts` - verifyAdmin()
