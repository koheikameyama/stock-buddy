# Railway セットアップガイド

このドキュメントでは、Stock BuddyをRailwayにデプロイする手順を説明します。

## 1. Railwayプロジェクトの作成

1. [Railway](https://railway.app/)にログイン
2. 「New Project」をクリック
3. 「Deploy from GitHub repo」を選択
4. `stock-buddy`リポジトリを選択

## 2. PostgreSQLサービスの追加

1. プロジェクト画面で「+ New」をクリック
2. 「Database」→「PostgreSQL」を選択
3. データベースが作成される（自動的に`DATABASE_URL`環境変数が設定される）

## 3. Next.jsサービスの設定

### 環境変数の設定

Railwayダッシュボードで以下の環境変数を設定：

```env
DATABASE_URL=<自動的に設定される>
NEXTAUTH_URL=https://your-app.railway.app
NEXTAUTH_SECRET=<ランダムな文字列を生成>
GOOGLE_CLIENT_ID=<GoogleクラウドコンソールのOAuthクライアントID>
GOOGLE_CLIENT_SECRET=<GoogleクラウドコンソールのOAuthシークレット>
OPENAI_API_KEY=sk-<OpenAI APIキー>
```

### ビルドコマンドの設定

デフォルトで以下が実行されます：
```bash
npm install
npm run build
```

### 開始コマンドの設定

```bash
npm start
```

### マイグレーションの実行

初回デプロイ時に、Railwayダッシュボードのコンソールで以下を実行：

```bash
npx prisma migrate deploy
```

## 4. Cron Jobの設定

毎日17:00 JST（08:00 UTC）に株価データを取得するCron Jobを設定します。

### 手順

1. Railwayプロジェクトで「+ New」をクリック
2. 「Empty Service」を選択
3. サービス名を「Stock Price Fetcher」に変更
4. 「Settings」タブで以下を設定：

#### Cron式
```
0 8 * * *
```
（毎日08:00 UTC = 17:00 JST）

#### Start Command
```bash
cd /app && python scripts/fetch_stocks.py
```

#### 環境変数
```env
DATABASE_URL=<PostgreSQLサービスのDATABASE_URL>
```

5. 「Deploy」をクリック

### Cronの動作確認

- Railwayダッシュボードの「Logs」タブで実行ログを確認
- 初回は手動実行して動作確認することを推奨

```bash
# Railwayコンソールで実行
python scripts/fetch_stocks.py
```

## 5. 初期データの投入

デプロイ後、Railwayダッシュボードのコンソールで以下を実行：

```bash
python scripts/init_data.py
```

主要銘柄34件と過去2年分の株価データが投入されます。

## 6. Google OAuth設定

### Google Cloud Consoleでの設定

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. プロジェクトを作成（または既存のプロジェクトを選択）
3. 「APIとサービス」→「認証情報」
4. 「認証情報を作成」→「OAuthクライアントID」
5. アプリケーションの種類：「ウェブアプリケーション」
6. 承認済みのリダイレクトURIに以下を追加：
   - `http://localhost:3000/api/auth/callback/google`（開発用）
   - `https://your-app.railway.app/api/auth/callback/google`（本番用）
7. クライアントIDとシークレットをRailwayの環境変数に設定

## 7. デプロイの確認

1. Railwayが提供するURLにアクセス
2. トップページが表示されることを確認
3. ログが正常に出力されていることを確認
4. データベースに銘柄データが存在することを確認：

```bash
# Railwayコンソールで実行
npx prisma studio
```

## トラブルシューティング

### マイグレーションエラー

```bash
# 強制的にマイグレーションを適用
npx prisma migrate deploy --force
```

### Cron Jobが実行されない

- Cron式が正しいか確認（`0 8 * * *`）
- 環境変数`DATABASE_URL`が設定されているか確認
- Railwayのログでエラーを確認

### Pythonパッケージが見つからない

`requirements.txt`が正しく配置されているか確認：

```bash
pip install -r scripts/requirements.txt
```

## 参考リンク

- [Railway Documentation](https://docs.railway.app/)
- [Prisma Railway Deployment Guide](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-railway)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
