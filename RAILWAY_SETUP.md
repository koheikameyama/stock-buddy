# Railway Pre-Deploy Command設定

## Railwayダッシュボードでの設定手順

### 1. Next.jsサービスを選択

1. Railwayダッシュボードを開く
2. **Next.jsサービス**（stock-buddy）をクリック

### 2. Settings → Deploy

1. **Settings**タブをクリック
2. 下にスクロールして**Deploy**セクションを探す

### 3. Pre-Deploy Command設定（重要）

デプロイ前に毎回マイグレーションを自動実行する設定：

1. **Deploy**セクションで**「Custom Build Command」**を探す
2. その下に**「Custom Install Command」**と**「Custom Start Command」**がある
3. **「Custom Start Command」の上**に、`railway run`というセクションがあれば、そこに以下を設定：

```bash
npm install && npm run migrate:deploy
```

または、シンプルに：

```bash
npm run migrate:deploy
```

**注意**: Railwayの仕様により、pre-deploy commandが見つからない場合は、次の手順を使用してください：

### 3-Alternative. Railway CLI経由でpre-deploy設定

`railway.toml`を作成して、pre-deployコマンドを設定する方法もあります（後述）。

### 4. Custom Start Command（不要）

Dockerfileを使用しているため、Start Commandは設定不要です。

### 4. Health Check Pathの設定（推奨）

Health Check Pathを設定して、アプリが正常に起動しているか確認：

```
/
```

### 5. Watch Pathsの設定（オプション）

特定のファイルが変更された時のみデプロイする場合：

```
app/**
lib/**
prisma/**
public/**
package.json
next.config.js
Dockerfile
```

## デプロイ時のマイグレーション自動実行設定

### 方法: Custom Build Command（推奨）

Railwayでは、ビルド完了後・デプロイ前に実行するコマンドを設定できます。

1. Railwayダッシュボードで**Next.jsサービス**を開く
2. **Settings**タブをクリック
3. **Deploy**セクションまでスクロール
4. **「Custom Build Command」**を探す
5. 以下のコマンドを入力：
   ```bash
   npm run build && npm run migrate:deploy
   ```

   または、buildは自動実行されるので：
   ```bash
   npm run migrate:deploy
   ```

6. **「Save」**をクリック

これで、次回デプロイ時から自動的にマイグレーションが実行されます。

**注意事項:**
- ✅ ビルド成功後、コンテナ起動前にマイグレーションが実行されます
- ✅ マイグレーション失敗時はデプロイが中止されます（安全）
- ✅ 再起動時には実行されません（デプロイ時のみ）

## 手動でマイグレーションを実行する方法

### オプション1: Railwayのワンクリックコマンド

1. Railwayダッシュボードで**Next.jsサービス**を開く
2. 右上の**「・・・」メニュー**
3. **「Run a Command」**をクリック
4. コマンドを入力：
   ```bash
   npm run migrate:deploy
   ```
5. **「Run」**をクリック

### オプション2: ターミナルで実行

1. Railwayダッシュボードで**Next.jsサービス**を開く
2. 右上の**「・・・」メニュー** → **「Open Terminal」**
3. ターミナルで実行：
   ```bash
   npm run migrate:deploy
   ```

### オプション3: GitHub Actionsで自動化（上級）

`.github/workflows/railway-deploy.yml`を作成して、PRマージ時に自動でマイグレーションを実行。

## 注意事項

- ⚠️ マイグレーションは**デプロイ前に1回だけ**実行してください
- ⚠️ 本番環境で初めてマイグレーションを実行する前に、データベースのバックアップを取ることを推奨
- ✅ マイグレーションは冪等性があるため、複数回実行しても安全です

## トラブルシューティング

### マイグレーションが失敗する

1. **DATABASE_URL**が正しく設定されているか確認
2. PostgreSQLサービスが起動しているか確認
3. ログでエラー内容を確認

### テーブルが作成されない

1. マイグレーションが正常に完了したか確認
2. PostgreSQLの**Data**タブでテーブル一覧を確認
3. 手動でSQLを実行して確認：
   ```sql
   \dt
   ```
