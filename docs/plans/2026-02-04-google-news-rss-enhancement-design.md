# Google News RSS強化機能 設計書

作成日: 2026-02-04

## 概要

現在のGoogle News RSS取得スクリプトを強化し、ニュース内容をMarketNewsテーブルに保存する機能を実装する。セクター分類とセンチメント分析をハイブリッドアプローチ（ルールベース + AI）で実現する。

## 目的

- ニュース情報を体系的に保存し、将来的な活用（通知、分析等）を可能にする
- セクターとセンチメント情報を付与して、ニュースの価値を高める
- コストと精度のバランスを取りながら、初心者向けに信頼性の高い情報を提供する

## アーキテクチャ

### 全体フロー

```
GitHub Actions (毎日22:00 JST)
↓
fetch_jpx_news.py
├─ 1. Google News RSSからニュース取得
├─ 2. 各ニュースを処理
│  ├─ ルールベースでセクター判定
│  ├─ ルールベースでセンチメント判定
│  └─ 判定できない場合 → OpenAI API呼び出し
├─ 3. MarketNewsテーブルに保存（バッチINSERT）
└─ 4. 銘柄コード抽出（既存機能）
```

### データベース

**接続方法:**
- 環境変数 `DATABASE_URL` を使用
- psycopg2でダイレクト接続
- バッチINSERTで効率的に保存（N+1問題回避）

**重複チェック:**
- タイトル + URL でユニーク判定
- 既存ニュースはスキップ

**保存先テーブル:**
```prisma
model MarketNews {
  id          String   @id @default(cuid())
  title       String
  content     String   @db.Text
  url         String?
  source      String   @default("tavily")
  sector      String?
  sentiment   String?
  publishedAt DateTime
  createdAt   DateTime @default(now())
}
```

## セクター分類とセンチメント分析

### ルールベース分類

**セクターキーワード:**
```python
SECTOR_KEYWORDS = {
    "半導体・電子部品": ["半導体", "電子部品", "チップ", "DRAM", "NAND"],
    "自動車": ["自動車", "トヨタ", "ホンダ", "日産", "EV", "電気自動車"],
    "金融": ["銀行", "証券", "保険", "金融", "メガバンク"],
    "医薬品": ["製薬", "医薬品", "新薬", "治験", "バイオ"],
    "通信": ["通信", "NTT", "KDDI", "ソフトバンク", "5G"],
    "小売": ["小売", "百貨店", "コンビニ", "EC", "通販"],
    "不動産": ["不動産", "マンション", "オフィス", "REIT"],
    "エネルギー": ["石油", "ガス", "電力", "エネルギー", "再生可能"],
    "素材": ["鉄鋼", "化学", "素材", "建材"],
    "IT・サービス": ["IT", "ソフトウェア", "クラウド", "AI", "DX"],
}
```

**センチメントキーワード:**
```python
SENTIMENT_KEYWORDS = {
    "positive": ["急騰", "上昇", "好調", "最高益", "増益", "買い", "強気"],
    "negative": ["急落", "下落", "減益", "赤字", "売り", "弱気", "懸念"],
    "neutral": ["横ばい", "様子見", "保ち合い", "変わらず"],
}
```

### AI分析（OpenAI）

**呼び出しタイミング:**
- ルールベースで判定できない場合のみ

**プロンプト:**
```
以下のニュースを分析して、セクターとセンチメントを判定してください。

タイトル: {title}
内容: {content}

回答形式（JSON）:
{"sector": "セクター名 or null", "sentiment": "positive/neutral/negative or null"}
```

**エラーハンドリング:**
- API失敗時 → セクター/センチメントをnullで保存
- リトライは行わない（コスト抑制）

## 実装の詳細

### 新しい関数

```python
def detect_sector_by_keywords(text: str) -> str | None
    """キーワードマッチングでセクター判定"""

def detect_sentiment_by_keywords(text: str) -> str | None
    """キーワードマッチングでセンチメント判定"""

def analyze_with_openai(title: str, content: str) -> dict
    """OpenAI APIでセクター・センチメント分析"""

def save_news_to_db(news_items: List[dict], conn) -> int
    """MarketNewsテーブルに保存（バッチINSERT）"""

def check_duplicate_news(title: str, url: str, conn) -> bool
    """重複チェック（タイトル+URLでユニーク判定）"""
```

### エラーハンドリング

- OpenAI API失敗 → セクター/センチメントをnullで保存
- DB接続失敗 → エラーログ出力してスクリプト終了
- RSS取得失敗 → そのフィードをスキップして次へ

### ログ出力

```
📡 Fetching RSS from ...
✅ Fetched 50 entries
🔍 Analyzing 30 new entries...
  ├─ Rule-based: 20 entries
  └─ AI-based: 10 entries
💾 Saved 30 news to database
```

## GitHub Actions

### ワークフロー変更

**ファイル:** `.github/workflows/featured-stocks.yml`

**変更内容:**
```yaml
- name: Fetch news and save to database
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  run: |
    python scripts/news/fetch_jpx_news.py
```

### 依存関係

**requirements.txt に追加:**
```
openai>=1.0.0
psycopg2-binary
feedparser
python-dateutil
```

### 実行タイミング

- 毎日22:00 JST（13:00 UTC）
- 手動実行も可能（workflow_dispatch）

## テストとデプロイ

### ローカルテスト

```bash
# 環境変数を設定
export DATABASE_URL="postgresql://kouheikameyama@localhost:5432/stock_buddy"
export OPENAI_API_KEY="sk-..."

# スクリプト実行
python scripts/news/fetch_jpx_news.py
```

### デプロイフロー

1. ローカルで実装・テスト
2. `git push origin main` でGitHubにプッシュ
3. GitHub Actionsで自動実行（翌日22:00から有効）

## パフォーマンスとコスト

### パフォーマンス見積もり

- RSS取得：1秒 x 2フィード = 2秒
- ルールベース分析：50件 x 0.01秒 = 0.5秒
- AI分析：10件 x 2秒 = 20秒（必要な場合のみ）
- DB保存：1秒
- **合計：約24秒以内**

### コスト見積もり

- OpenAI API：1日10件 x $0.001 = $0.01/日 = $0.30/月
- GitHub Actions：無料枠内

## 将来の活用方法

保存されたニュースデータの活用例：

1. **ユーザー通知**
   - 保有銘柄に関連するニュースをプッシュ通知
   - セクター別のニュース配信

2. **市場分析**
   - センチメント分析を使った市場の雰囲気可視化
   - セクター別のトレンド分析

3. **AI分析の強化**
   - 銘柄推奨時の追加コンテキスト
   - ニュースベースの投資判断サポート

## Stock Buddyコンセプトとの整合性

- **初心者向け**: 1日1回の更新で十分（リアルタイム性よりも質）
- **寄り添う**: セクターとセンチメントで分かりやすく分類
- **シンプル**: 既存ワークフローを拡張するだけ
- **安心**: 信頼性の高いソース（Google News RSS）
