# Twitter Integration Scripts

Twitter (X) から投資関連の情報を収集するためのスクリプト群です。

## 概要

このディレクトリには、以下の2つのメインスクリプトがあります：

1. **`auto_follow.py`** - 投資インフルエンサーを自動でフォロー
2. **`collect_tweets.py`** - ツイートを収集し、銘柄コードを抽出

## 前提条件

### 1. twikit のインストール

```bash
pip install twikit
```

### 2. Twitter (X) アカウント

- アクティブなTwitterアカウントが必要です
- API keyは不要（twikitはスクレイピングベース）

### 3. 環境変数の設定

以下の環境変数を設定してください：

```bash
export TWITTER_USERNAME="your_username"
export TWITTER_EMAIL="your_email@example.com"
export TWITTER_PASSWORD="your_password"
```

または `.env` ファイルに記載：

```env
TWITTER_USERNAME=your_username
TWITTER_EMAIL=your_email@example.com
TWITTER_PASSWORD=your_password
```

**⚠️ 重要:** 認証情報は絶対にGitにコミットしないでください。

## スクリプト詳細

### 1. auto_follow.py

投資インフルエンサーを自動でフォローするスクリプトです。

#### 機能

- **定義済みインフルエンサーリスト**: 50-100人の投資系アカウントをフォロー
- **検索ベースの発見**: 高エンゲージメントツイートの投稿者を自動発見
- **レート制限対策**: 1日50人まで、フォロー間隔2分
- **Cookie永続化**: ログイン情報を保存し、再利用
- **詳細ログ**: フォローしたアカウントを `twitter_follows.json` に記録

#### フォロー戦略

**定義済みインフルエンサー:**
- じっちゃま (hirosetakao)
- 株教材 (kabukyodai)
- フィスコ (fisco_jp)
- トレーダーズ・ウェブ (traders_web)
- 日本経済新聞 (nikkei)
- その他10アカウント

**検索ベース:**
- 検索クエリ: 日経平均、日本株、東証、株式投資、IPO、銘柄
- 条件: RT > 100 AND Likes > 500 のツイートの投稿者

#### 使い方

```bash
# 本番実行（実際にフォロー）
python scripts/twitter/auto_follow.py

# ドライラン（フォローせずにログのみ表示）
python scripts/twitter/auto_follow.py --dry-run
```

#### 出力ファイル

- **`twitter_follows.json`**: フォローしたアカウントのログ
  ```json
  [
    {
      "user_id": "123456789",
      "username": "hirosetakao",
      "reason": "predefined_influencer",
      "followed_at": "2025-01-15T10:30:00"
    }
  ]
  ```

- **`cookies.json`**: 認証情報（自動生成、Gitにコミットしない）

#### レート制限

- **1日の上限**: 50フォロー
- **フォロー間隔**: 2分（120秒）
- **検索間隔**: 1分（60秒）

これらの制限により、Twitterアカウントの停止リスクを最小化しています。

### 2. collect_tweets.py

フォローしているアカウントのツイートを収集し、銘柄コードを抽出します。

#### 機能

- **タイムライン収集**: ホームタイムラインからツイートを取得
- **フォローアカウント収集**: `twitter_follows.json` に記録されたアカウントから収集
- **検索ベース収集**: キーワード検索でツイートを収集
- **銘柄コード抽出**: 4桁の数字（日本株のティッカー）を自動抽出
- **重複排除**: ツイートIDで重複をチェック
- **時間範囲フィルタ**: デフォルトで過去24時間

#### 使い方

```bash
# デフォルト（過去24時間、最大1000ツイート）
python scripts/twitter/collect_tweets.py

# 時間範囲を指定（過去12時間）
python scripts/twitter/collect_tweets.py --hours 12

# 最大ツイート数を指定
python scripts/twitter/collect_tweets.py --max 500

# 両方指定
python scripts/twitter/collect_tweets.py --hours 6 --max 200
```

#### 出力ファイル

**`twitter_tweets.json`**: 収集したツイートのデータ

```json
{
  "collected_at": "2025-01-15T15:00:00",
  "hours_back": 24,
  "total_tweets": 350,
  "unique_tickers": 42,
  "ticker_mentions": {
    "7203.T": 15,
    "6758.T": 12,
    "9984.T": 10
  },
  "tweets": [
    {
      "id": "1234567890",
      "text": "トヨタ(7203)が上昇中！今日は買いかも",
      "author": "kabu_trader",
      "author_id": "987654321",
      "created_at": "2025-01-15T14:30:00",
      "retweet_count": 25,
      "favorite_count": 150,
      "reply_count": 5,
      "tickers": ["7203.T"]
    }
  ]
}
```

#### 銘柄コード抽出

- **パターン**: `\b\d{4}\b` （4桁の数字）
- **フォーマット**: `.T` サフィックスを自動追加（yfinance互換）
- **例**: `7203` → `7203.T` (トヨタ自動車)

#### 収集戦略

1. **タイムライン**: 最新100ツイート
2. **フォローアカウント**: 各アカウントから最新20ツイート（最大50アカウント）
3. **検索**: 各クエリで50ツイート（日経平均、日本株、東証、株式投資、IPO、銘柄）

## ワークフロー例

### 1. 初回セットアップ

```bash
# 1. 依存関係をインストール
pip install twikit

# 2. 環境変数を設定
export TWITTER_USERNAME="your_username"
export TWITTER_EMAIL="your_email@example.com"
export TWITTER_PASSWORD="your_password"

# 3. ドライランでテスト
python scripts/twitter/auto_follow.py --dry-run
```

### 2. 定期実行

```bash
# 毎日実行: インフルエンサーをフォロー
python scripts/twitter/auto_follow.py

# 数時間ごとに実行: ツイートを収集
python scripts/twitter/collect_tweets.py --hours 6
```

### 3. GitHub Actions での自動化

```yaml
name: Twitter Data Collection

on:
  schedule:
    - cron: '0 */6 * * *'  # 6時間ごと

jobs:
  collect-tweets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install twikit

      - name: Collect tweets
        env:
          TWITTER_USERNAME: ${{ secrets.TWITTER_USERNAME }}
          TWITTER_EMAIL: ${{ secrets.TWITTER_EMAIL }}
          TWITTER_PASSWORD: ${{ secrets.TWITTER_PASSWORD }}
        run: python scripts/twitter/collect_tweets.py --hours 6
```

## データ活用例

### 1. ホット銘柄の検出

```python
import json

# ツイートデータを読み込み
with open('scripts/twitter/twitter_tweets.json', 'r') as f:
    data = json.load(f)

# 最も言及されている銘柄トップ10
top_tickers = sorted(
    data['ticker_mentions'].items(),
    key=lambda x: x[1],
    reverse=True
)[:10]

print("今日の注目銘柄:")
for ticker, count in top_tickers:
    print(f"{ticker}: {count}回言及")
```

### 2. センチメント分析（次のステップ）

```python
# OpenAI APIでポジティブ/ネガティブを判定
# この機能は今後実装予定
```

## トラブルシューティング

### ログインエラー

```
❌ Error: Login failed: Challenge required
```

**対処法:**
1. Twitterにブラウザでログイン
2. 2段階認証が有効な場合は一時的に無効化
3. アプリパスワードを使用する

### レート制限エラー

```
❌ Error: Rate limit exceeded
```

**対処法:**
1. `FOLLOW_DELAY_SECONDS` を増やす（例: 180秒）
2. 1日のフォロー上限を減らす（例: 30人）
3. 時間を空けて再実行

### Cookie エラー

```
⚠️ Warning: Failed to load cookies
```

**対処法:**
1. `cookies.json` を削除
2. スクリプトを再実行（新規ログイン）

## セキュリティ

### .gitignore に追加

以下のファイルは絶対にGitにコミットしないでください：

```gitignore
scripts/twitter/cookies.json
scripts/twitter/twitter_follows.json
scripts/twitter/twitter_tweets.json
```

### 認証情報の管理

- 環境変数またはシークレット管理ツールを使用
- ハードコードしない
- GitHub Actionsでは `secrets` を使用

## 制限事項

### Twitter API 利用制限

- twikitはスクレイピングベースのため、公式APIの制限を受けません
- ただし、過度なリクエストはアカウント停止のリスクがあります

### 推奨運用

- **フォロー**: 1日50人まで
- **ツイート収集**: 6時間ごと、最大1000ツイート
- **エラー時**: 再試行前に十分な待機時間（30分以上）

## 今後の拡張予定

- [ ] センチメント分析（OpenAI API）
- [ ] データベース連携（Prisma）
- [ ] リアルタイムストリーム収集
- [ ] トレンド分析ダッシュボード
- [ ] Slack/Discord通知

## 参考リンク

- [twikit GitHub](https://github.com/d60/twikit)
- [twikit Documentation](https://twikit.readthedocs.io/)
- [Twitter Developer Policy](https://developer.twitter.com/en/developer-terms/policy)

## ライセンス

このプロジェクトのライセンスに従います。

---

**注意:** Twitterの利用規約を遵守し、過度なスクレイピングは避けてください。
