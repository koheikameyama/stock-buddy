# Google OAuth 設定ガイド

Stock BuddyでGoogleログインを使用するための設定手順です。

## 1. Google Cloud Consoleにアクセス

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. Googleアカウントでログイン

## 2. プロジェクトの作成

1. 画面上部の「プロジェクトを選択」をクリック
2. 「新しいプロジェクト」をクリック
3. プロジェクト名を入力（例: `Stock Buddy`）
4. 「作成」をクリック

## 3. OAuth同意画面の設定

1. 左メニューから「APIとサービス」→「OAuth同意画面」を選択
2. User Type: 「外部」を選択して「作成」
3. アプリ情報を入力：
   - **アプリ名**: `Stock Buddy`
   - **ユーザーサポートメール**: あなたのメールアドレス
   - **アプリのロゴ**: （任意）
   - **承認済みドメイン**: （本番環境のドメイン、例: `your-app.railway.app`）
   - **デベロッパーの連絡先情報**: あなたのメールアドレス
4. 「保存して次へ」をクリック

### スコープの設定

1. 「スコープを追加または削除」をクリック
2. 以下のスコープを選択：
   - `openid`
   - `email`
   - `profile`
3. 「更新」→「保存して次へ」

### テストユーザーの追加（開発中）

1. 「テストユーザーを追加」をクリック
2. 自分のGoogleアカウントのメールアドレスを追加
3. 「保存して次へ」

## 4. OAuth クライアントIDの作成

1. 左メニューから「APIとサービス」→「認証情報」を選択
2. 「認証情報を作成」→「OAuthクライアントID」をクリック
3. アプリケーションの種類: 「ウェブアプリケーション」を選択
4. 名前を入力（例: `Stock Buddy Web Client`）

### 承認済みのJavaScript生成元

以下を追加：
```
http://localhost:3000
https://your-app.railway.app
```

### 承認済みのリダイレクトURI

以下を追加：
```
http://localhost:3000/api/auth/callback/google
https://your-app.railway.app/api/auth/callback/google
```

5. 「作成」をクリック

## 5. クライアントIDとシークレットをコピー

作成完了画面に表示される以下の情報をコピーしてください：

- **クライアントID**: `1234567890-xxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com`
- **クライアントシークレット**: `GOCSPX-xxxxxxxxxxxxxxxxxxxx`

## 6. 環境変数の設定

### ローカル開発環境

`.env`ファイルに追加：

```env
GOOGLE_CLIENT_ID="1234567890-xxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxxxxxxxxx"
```

### Railway本番環境

Railwayダッシュボードで環境変数を設定：

1. プロジェクトを選択
2. Next.jsサービスを選択
3. 「Variables」タブをクリック
4. 以下を追加：
   - `GOOGLE_CLIENT_ID`: クライアントID
   - `GOOGLE_CLIENT_SECRET`: クライアントシークレット

## 7. 動作確認

### ローカル環境

1. 開発サーバーを起動：
   ```bash
   npm run dev
   ```

2. ブラウザで `http://localhost:3000` にアクセス

3. Googleログインボタンをクリック

4. Googleアカウントでログイン

### 本番環境

1. Railwayにデプロイ後、提供されたURLにアクセス

2. Googleログインをテスト

## トラブルシューティング

### エラー: `redirect_uri_mismatch`

**原因**: リダイレクトURIが登録されていない

**解決方法**:
1. Google Cloud Consoleで「認証情報」を開く
2. 作成したOAuthクライアントIDをクリック
3. 「承認済みのリダイレクトURI」に正しいURLが登録されているか確認
4. エラーメッセージに表示されているURIを追加

### エラー: `invalid_client`

**原因**: クライアントIDまたはシークレットが間違っている

**解決方法**:
1. `.env`または環境変数の値を確認
2. Google Cloud Consoleで正しい値をコピーし直す

### エラー: `access_denied`

**原因**: テストユーザーに追加されていない（開発中の場合）

**解決方法**:
1. OAuth同意画面で「テストユーザー」にメールアドレスを追加

### 本番公開する場合

1. OAuth同意画面で「アプリを公開」をクリック
2. Googleの審査を受ける（通常数日）
3. 承認されると誰でもGoogleログインが使えるようになります

## セキュリティのベストプラクティス

- ✅ クライアントシークレットは絶対に公開しない
- ✅ `.env`ファイルは`.gitignore`に含める
- ✅ 本番環境と開発環境で別々のOAuthクライアントを使う
- ✅ 定期的にクライアントシークレットをローテーションする
- ✅ 不要になったOAuthクライアントは削除する

## 参考リンク

- [Google OAuth 2.0 ドキュメント](https://developers.google.com/identity/protocols/oauth2)
- [NextAuth.js Google Provider](https://next-auth.js.org/providers/google)
- [Google Cloud Console](https://console.cloud.google.com/)
