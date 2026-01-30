# GitHub Actions 設定ガイド

## 概要

このプロジェクトでは、GitHub Actionsを使って毎日自動的に株価データを取得します。

## ワークフロー

### 実行スケジュール

バッチ処理は以下の順序で実行されます:

1. **マーケットニュース取得** (07:00 JST) - 市場開始前
2. **株価データ取得** (16:00 JST) - 市場クローズ（15:00）後
3. **今日の注目銘柄生成** (17:00 JST) - 株価データ取得後
4. **日次分析** (18:00 JST) - ポートフォリオ・ウォッチリスト分析、プッシュ通知送信
5. **週次レポート生成** (19:00 JST) - ポートフォリオレポート、プッシュ通知送信

### daily-stock-fetch.yml

毎日平日16:00（JST）に自動実行され、登録済み銘柄の最新株価データを取得します。

**実行タイミング:**
- 自動: 月曜〜金曜 16:00 JST（市場クローズ後）
- 手動: GitHub ActionsのUIから手動実行可能

## セットアップ手順

### 1. GitHub Secretsの設定

GitHubリポジトリでDATABASE_URLをSecretとして登録する必要があります。

1. GitHubリポジトリを開く
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret**をクリック
4. 以下を入力:
   - **Name**: `DATABASE_URL`
   - **Secret**: RailwayのPostgreSQL接続URL
     ```
     postgresql://postgres:PASSWORD@HOST:PORT/railway
     ```
5. **Add secret**をクリック

### 2. ワークフローの有効化

ワークフローは`.github/workflows/daily-stock-fetch.yml`に定義されています。

このファイルがmainブランチにマージされると、自動的に有効になります。

### 3. 手動実行

手動で実行する場合:

1. GitHubリポジトリで**Actions**タブを開く
2. 左側から**Daily Stock Price Fetch**を選択
3. **Run workflow**をクリック
4. ブランチを選択（通常はmain）
5. **Run workflow**をクリック

### 4. 実行結果の確認

1. **Actions**タブで実行履歴を確認
2. 各実行をクリックすると詳細ログが表示される
3. エラーが発生した場合は、ログで原因を確認

## トラブルシューティング

### DATABASE_URLが見つからない

**エラー:**
```
ERROR: DATABASE_URL environment variable is not set
```

**解決方法:**
GitHub Secretsに`DATABASE_URL`が正しく登録されているか確認してください。

### Pythonパッケージのインストールエラー

**エラー:**
```
ModuleNotFoundError: No module named 'yfinance'
```

**解決方法:**
ワークフローの`Install dependencies`ステップで正しくインストールされているか確認してください。

### データベース接続エラー

**エラー:**
```
could not connect to server
```

**解決方法:**
1. RailwayのPostgreSQLサービスが起動しているか確認
2. DATABASE_URLが正しいか確認
3. RailwayのIPアドレス制限がある場合は、GitHub ActionsのIPを許可

## スケジュール変更

実行時刻を変更する場合は、各ワークフローファイルの`cron`を編集してください。
依存関係があるため、以下の順序を守ることを推奨します:

1. **fetch-market-news.yml**: 市場開始前（現在: 07:00 JST）
2. **daily-stock-fetch.yml**: 市場クローズ後（現在: 16:00 JST）
3. **daily-featured-stocks.yml**: 株価データ取得後（現在: 17:00 JST）
4. **daily-analysis.yml**: 注目銘柄生成後（現在: 18:00 JST）
5. **daily-report.yml**: 日次分析後（現在: 19:00 JST）

**Cron形式:**
```
分 時 日 月 曜日
0  7  *  *  1-5  # 毎週月〜金曜、07:00 UTC (16:00 JST)
0  22 *  *  *    # 毎日、22:00 UTC (翌日07:00 JST)
```

**注意**: cronはUTC時刻で指定します。JST = UTC + 9時間

## 参考リンク

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Cron Syntax](https://crontab.guru/)
- [yfinance Documentation](https://pypi.org/project/yfinance/)
