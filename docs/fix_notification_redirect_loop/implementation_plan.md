# 通知APIのリダイレクトループ修正計画

通知API (`/api/notifications`) で `ERR_TOO_MANY_REDIRECTS` が発生している問題を修正します。

## 現状の分析

- `Header` コンポーネントが全ページで `NotificationBell` をレンダリングしている。
- `NotificationBell` はクライアントサイドで `/api/notifications?limit=1` をフェッチする。
- ユーザーが未ログインの場合、APIルートが 401 を返すべきだが、NextAuth の設定やミドルウェアの挙動により `/login` へリダイレクトされている可能性がある。
- `/login` ページでも `Header` が表示され、再度 API 呼び出しが行われることでループが発生している可能性がある。

## 修正案

### 1. [Header.tsx](../../app/components/Header.tsx) の条件付きレンダリング

- `Header` はサーバーコンポーネントであるため、ここで事前に `auth()` を呼び出してセッションを確認する。
- セッションがある場合のみ `NotificationBell` をレンダリングするように変更する。これにより、ログインページなどの公開ページでの不要な API 呼び出しを抑制する。

### 2. [NotificationBell.tsx](../../app/components/NotificationBell.tsx) のガード追加 (念のため)

- クライアントサイドでも、fetch の結果が 401 や 302 (OK以外) の場合のハンドリングを強化する。

### 3. [auth.ts](../../auth.ts) の調査と調整

- `authorized` コールバックが意図せず API ルートに適用されていないか確認する。
- 必要であれば、API ルートを除外する設定を明確にする。

## 変更内容

### [Header.tsx](../../app/components/Header.tsx)

- `auth()` を呼び出し、`session` が存在する場合のみ `<NotificationBell />` を表示する。

### [NotificationBell.tsx](../../app/components/NotificationBell.tsx)

- fetch 前にセッション情報を渡すなどの工夫、またはレスポンスチェックの強化。

## 検証計画

### 自動テスト

- 現時点ではブラウザ操作ツールを使用して、未ログイン状態で `/` や `/login` にアクセスした際にエラーが発生しないことを確認する。

### 手動確認

1. ログアウト状態でトップページ (`/`) にアクセスする。
2. ブラウザのコンソールを開き、`/api/notifications` への fetch エラーやリダイレクトループが発生していないことを確認する。
3. ログインして、正常に通知ベルが表示され、件数が取得できることを確認する。
