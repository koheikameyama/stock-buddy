# ニュース機能設計

## 概要

日本株ニュースに加えて米国市場ニュースを取得し、ダッシュボードと専用ページでユーザーに提供する機能。保有銘柄との関連付けにより、初心者でも「なぜこのニュースが重要か」を理解できる。

## 目的

- ユーザーの投資判断の精度向上
- 米国市場の動向が日本株に与える影響を可視化
- 初心者向けに「保有銘柄への影響」という文脈でニュースを提供

## 機能構成

| 項目 | 内容 |
|---|---|
| ダッシュボード | 「最新のニュース」セクション（3〜5件） |
| ニュースページ | 全ニュース一覧（日本＋米国） |
| 範囲 | 日本株 + 米国市場 |
| 関連付け | 保有銘柄との関係を表示 |
| 更新 | 朝1回（7時頃、GitHub Actions） |

## データベース設計

既存の `MarketNews` テーブルを拡張する。

```prisma
model MarketNews {
  id          String   @id @default(cuid())
  title       String
  content     String
  url         String?
  source      String   // "google_news", "bloomberg" など
  sector      String?  // "半導体・電子部品", "Technology" など
  sentiment   String?  // "positive", "neutral", "negative"
  publishedAt DateTime
  createdAt   DateTime @default(now())

  // 追加フィールド
  market      String   @default("JP")  // "JP" or "US"
  region      String?  // "米国", "日本" など（表示用）
}
```

## 米国ニュース取得

### ソース（Google News RSS）

| カテゴリ | 検索クエリ |
|---|---|
| 主要指数 | `S&P500 OR NASDAQ OR NYSE stock market` |
| 金融政策 | `FOMC OR Federal Reserve interest rate` |
| 決算関連 | `earnings report tech stocks` |
| 半導体 | `semiconductor stocks NVIDIA AMD Intel` |

### セクターマッピング（米国→日本）

| 米国ニュースのセクター | 関連する日本株セクター |
|---|---|
| Technology / Semiconductor | 半導体・電子部品 |
| Automotive / EV | 自動車 |
| Financial / Banking | 金融 |
| Energy | エネルギー |
| Healthcare / Pharma | 医薬品 |

## 保有銘柄との関連付けロジック

1. **日本株ニュース** → 銘柄コード（4桁）で直接マッチ
2. **米国ニュース** → セクターでマッチ
   - 例：米国半導体ニュース → 日本の半導体銘柄（東京エレクトロン等）に関連

## UI設計

### 1. ダッシュボード「最新のニュース」セクション

```
📰 最新のニュース
─────────────────────────────────
🇺🇸 NASDAQが2%上昇、半導体株が牽引
   → あなたの保有銘柄「東京エレクトロン」に関連
   3時間前

🇯🇵 トヨタ、EV新モデル発表で株価上昇
   → あなたの保有銘柄「トヨタ自動車」に関連
   5時間前

🇺🇸 FOMC、金利据え置きを発表
   → 為替・輸出関連銘柄に影響の可能性
   8時間前

              [もっと見る →]
─────────────────────────────────
```

### 2. ニュースページ（/news）

- フィルター：全て / 日本 / 米国
- ソート：新着順
- 各ニュースに「関連銘柄」タグを表示
- ニュースをクリックで外部リンクへ

## 実装ファイル構成

```
app/
  (main)/
    news/
      page.tsx              # ニュース一覧ページ
components/
  dashboard/
    latest-news.tsx         # ダッシュボード用コンポーネント
  news/
    news-card.tsx           # ニュースカード
    news-list.tsx           # ニュース一覧
    news-filter.tsx         # フィルターUI
  skeletons/
    news-skeleton.tsx       # ローディング用スケルトン
scripts/
  news/
    fetch-us-news.ts        # 米国ニュース取得（新規）
lib/
  news.ts                   # ニュース取得・関連付けロジック
prisma/
  migrations/xxx_add_market_to_news/
    migration.sql           # マイグレーション
.github/
  workflows/
    fetch-us-news.yml       # 朝7時実行のワークフロー
```

## 実装タスク

### Phase 1: データ基盤
1. MarketNewsテーブルにmarket/regionカラム追加
2. 米国ニュース取得スクリプト作成（fetch-us-news.ts）
3. GitHub Actionsワークフロー設定（朝7時実行）

### Phase 2: バックエンド
4. ニュース取得API作成（/api/news）
5. 保有銘柄との関連付けロジック実装（lib/news.ts）

### Phase 3: フロントエンド
6. ダッシュボード「最新のニュース」セクション
7. ニュースページ（/news）
8. スケルトンコンポーネント

### Phase 4: 仕上げ
9. テスト・動作確認
10. 既存の日本ニュースにmarket="JP"を設定

## 注意事項

- 初心者向けサービスなので、ニュース量は絞る（情報過多を避ける）
- 専門用語には解説を添える（Stock Buddyのコンセプト）
- 保有銘柄との関連が不明確なニュースは優先度を下げる

## 将来の拡張

- 欧州市場の追加（需要があれば）
- リアルタイム更新（コスト次第）
- プッシュ通知（重要ニュース発生時）
