# セクタートレンド分析機能 設計書

## 概要

ニュースデータからセクター別のトレンド（勢い）を分析し、おすすめ銘柄選定・購入判断・ポートフォリオ分析・ダッシュボード表示に活用する。US→JP連動分析も含む。

## 機能一覧

1. **セクタートレンド計算** - ニュースの量×センチメントからセクターごとの勢いスコアを算出
2. **おすすめ銘柄への反映** - スコアリングボーナス + AIプロンプトコンテキスト
3. **購入判断・ポートフォリオ分析への反映** - AIの判断材料として提供
4. **US→JP連動分析** - 米国セクターニュースを日本セクターに合算
5. **ダッシュボード ヒートマップ** - セクター別の勢いを色で可視化

## データモデル

### SectorTrend テーブル

```prisma
model SectorTrend {
  id        String   @id @default(cuid())
  date      DateTime @db.Date
  sector    String

  // 3日窓（短期の勢い）
  score3d       Float
  newsCount3d   Int
  positive3d    Int
  negative3d    Int
  neutral3d     Int

  // 7日窓（中期トレンド）
  score7d       Float
  newsCount7d   Int
  positive7d    Int
  negative7d    Int
  neutral7d     Int

  // US→JP連動
  usNewsCount3d Int   @default(0)
  usNewsCount7d Int   @default(0)

  // メタ
  trendDirection String   // "up" | "down" | "neutral"
  createdAt  DateTime @default(now())

  @@unique([date, sector])
  @@index([date])
  @@index([sector])
}
```

### スコア計算式

```
score = ((positive - negative) / newsCount) × 100 × log2(newsCount + 1)
```

- `(positive - negative) / newsCount` → センチメント比率（-1〜+1）
- `× 100` → -100〜+100にスケール
- `× log2(newsCount + 1)` → ニュース量による重み付け

JP+USのニュースを合算してスコア算出。USニュースは影響度0.7倍で減衰。

### トレンド方向の判定

| score3d | trendDirection |
|---|---|
| >= +20 | "up" |
| <= -20 | "down" |
| それ以外 | "neutral" |

## 計算ロジック

### 実行タイミング

既存の `fetch-news.yml` ワークフローに追加ステップとして組み込み:

```
fetch-jp-news → fetch-us-news → calculate-sector-trends（新規）
```

### 計算スクリプト

`scripts/news/calculate-sector-trends.ts`

処理フロー:
1. MarketNewsテーブルから直近7日分のニュースを1クエリで取得
2. セクター × センチメント × market でJS上で集計
3. `lib/news.ts` の既存 `US_SECTOR_MAP` でUS→JPマッピング適用
4. USニュースのセンチメントを対応するJPセクターに合算（×0.7減衰）
5. 3日窓・7日窓それぞれのスコアを計算
6. SectorTrendテーブルに10セクター分をUPSERT

### US→JP合算

既存のセクターマッピング（`lib/news.ts`）を使用:
- US "Semiconductor" → JP "半導体・電子部品"
- US "Technology" → JP "IT・サービス"
- US "Automotive" / "EV" → JP "自動車"
- etc.

### 定数（`lib/constants.ts`）

```typescript
SECTOR_TREND_UP_THRESHOLD = 20
SECTOR_TREND_DOWN_THRESHOLD = -20
US_INFLUENCE_WEIGHT = 0.7
```

## ダッシュボード: セクターヒートマップ

### 配置

ダッシュボードの「最新のニュース」セクションの上。

### UI

- 10セクターを3列のグリッドで表示
- 各タイルに: セクター名、矢印（▲▶▼）、スコア、ニュース件数、US由来件数
- 3日 / 7日 の切り替えタブ
- タップで関連ニュース3件を展開表示

### 色の対応

| スコア範囲 | 色 | 矢印 |
|---|---|---|
| +20以上 | 緑（`text-green-600 bg-green-50`〜`bg-green-200`） | ▲ |
| -20〜+20 | グレー（`text-muted-foreground bg-muted`） | ▶ |
| -20以下 | 赤（`text-red-600 bg-red-50`〜`bg-red-200`） | ▼ |

スコアの絶対値に応じて色の濃さをグラデーション。

### コンポーネント

- `app/dashboard/SectorTrendHeatmap.tsx` - メインコンポーネント
- `app/dashboard/SectorTrendSkeleton.tsx` - スケルトン
- `app/api/sector-trends/route.ts` - データ取得API

## AI分析への統合

### 共通ユーティリティ

`lib/sector-trend.ts`:

```typescript
getSectorTrend(sector: string): Promise<SectorTrend | null>
getAllSectorTrends(): Promise<SectorTrend[]>
formatSectorTrendForPrompt(trend: SectorTrend): string
```

### 1. おすすめ銘柄選定

**スコアリング段階**（`lib/recommendation-scoring.ts`）:

```
score3d >= 40  → +15点
score3d >= 20  → +10点
score3d <= -40 → -10点
score3d <= -20 → -5点
```

**AIプロンプト段階**（`app/api/recommendations/generate-daily/route.ts`）:

システムプロンプトに「市場セクター動向」セクションを追加:
```
## 市場セクター動向
【半導体・電子部品】▲ 強い追い風（スコア+42、ニュース12件）
【金融】▼ 逆風（スコア-35、ニュース8件）
...
```

### 2. ウォッチリスト購入判断

`app/api/stocks/[stockId]/purchase-recommendation/route.ts`

分析コンテキストにセクタートレンド情報を追加。AIが買い/待ちを判断する際の追加材料。

### 3. ポートフォリオ分析

`app/api/stocks/[stockId]/portfolio-analysis/route.ts`

分析コンテキストにセクタートレンド情報を追加。保有継続/売却検討の判断材料。

## 変更ファイル一覧

| 区分 | ファイル | 変更内容 |
|---|---|---|
| スキーマ | `prisma/schema.prisma` | SectorTrendモデル追加 |
| 定数 | `lib/constants.ts` | 閾値・重み定数追加 |
| 計算 | `scripts/news/calculate-sector-trends.ts` | 新規: トレンド計算スクリプト |
| 共通 | `lib/sector-trend.ts` | 新規: 取得・フォーマット関数 |
| ワークフロー | `.github/workflows/fetch-news.yml` | 計算ステップ追加 |
| API | `app/api/sector-trends/route.ts` | 新規: ダッシュボード用API |
| UI | `app/dashboard/SectorTrendHeatmap.tsx` | 新規: ヒートマップ |
| UI | `app/dashboard/SectorTrendSkeleton.tsx` | 新規: スケルトン |
| UI | `app/dashboard/page.tsx` | ヒートマップ組み込み |
| 推薦 | `lib/recommendation-scoring.ts` | セクターボーナス追加 |
| 推薦 | `app/api/recommendations/generate-daily/route.ts` | AIプロンプト追加 |
| 分析 | `lib/stock-analysis-context.ts` | セクタートレンドコンテキスト追加 |

## スコープ外

- セクタートレンドの過去推移グラフ（将来対応）
- ニュース以外のデータ（株価変動率等）をトレンドに組み込む（将来対応）
- セクターごとの個別ページ
