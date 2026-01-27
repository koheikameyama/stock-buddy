# Railway Pre-Deploy Command設定

## Railwayダッシュボードでの設定手順

### 1. Next.jsサービスを選択

1. Railwayダッシュボードを開く
2. **Next.jsサービス**（stock-buddy）をクリック

### 2. Settings → Deploy

1. **Settings**タブをクリック
2. 下にスクロールして**Deploy**セクションを探す

### 3. Custom Start Command（不要）

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

## マイグレーション実行方法

### オプション1: Railwayのワンクリックコマンド（推奨）

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
