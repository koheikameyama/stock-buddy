# GitHub Actions 設定ガイド

## 概要

このプロジェクトでは、GitHub Actionsを使って毎日自動的に株価データを取得します。

## ワークフロー

### daily-stock-fetch.yml

毎日平日18:00（JST）に自動実行され、登録済み銘柄の最新株価データを取得します。

**実行タイミング:**
- 自動: 月曜〜金曜 18:00 JST（市場クローズ後）
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

実行時刻を変更する場合は、`.github/workflows/daily-stock-fetch.yml`の`cron`を編集:

```yaml
schedule:
  # 例: 毎日21:00 JST (UTC 12:00)に実行
  - cron: '0 12 * * 1-5'
```

**Cron形式:**
```
分 時 日 月 曜日
0  9  *  *  1-5  # 毎週月〜金曜、09:00 UTC (18:00 JST)
```

## 参考リンク

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Cron Syntax](https://crontab.guru/)
- [yfinance Documentation](https://pypi.org/project/yfinance/)
