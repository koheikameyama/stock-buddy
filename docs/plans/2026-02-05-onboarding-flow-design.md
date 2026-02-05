# オンボーディングフロー改善設計

## 背景

新規ログイン直後にモーダルが複数表示されてしまう問題を解決する。

### 現状の問題

- 利用規約モーダル → 投資スタイルモーダル → PWAプロンプト → プッシュ通知プロンプトが連続表示
- ユーザー体験が悪い

## 設計

### 全体フロー

```
ログイン
  ↓
ミドルウェアでチェック
  ↓
┌─ termsAccepted = false ?
│  → /terms-acceptance へリダイレクト
│
└─ termsAccepted = true
   → /dashboard へ
      ↓
      hasInvestmentStyle = false ?
      → 投資スタイルモーダル表示（閉じれない、保存必須）
```

### 変更内容

| 項目 | Before | After |
|------|--------|-------|
| 利用規約 | ダッシュボード上のモーダル | 独立ページ `/terms-acceptance` |
| 投資スタイル | 閉じれるモーダル | 閉じれないモーダル（未設定時） |
| PWAインストール | 3秒後に自動表示 | 変更なし |
| プッシュ通知 | 2秒後、3回目訪問以降 | 変更なし |

## 実装タスク

### 1. `/terms-acceptance` ページを新規作成

- パス: `/app/terms-acceptance/page.tsx`
- 内容: 現在の `TermsModal` の内容を移植
  - 免責事項チェックボックス
  - 利用規約チェックボックス
  - プライバシーポリシーチェックボックス
  - 「同意してサービスを利用する」ボタン
- 同意後: `/dashboard` へリダイレクト

### 2. ミドルウェアで未同意ユーザーをリダイレクト

- ファイル: `/middleware.ts`
- ロジック:
  - 認証済みユーザーがダッシュボードにアクセス
  - `termsAccepted = false` の場合 → `/terms-acceptance` へリダイレクト
  - `/terms-acceptance` ページ自体は認証済みユーザーがアクセス可能

### 3. `InvestmentStyleModal` を「閉じれない」モードに変更

- ファイル: `/app/components/InvestmentStyleModal.tsx`
- 変更:
  - `required` プロパティを追加
  - `required = true` の場合、閉じるボタン・オーバーレイクリックで閉じない
  - ダッシュボードから呼び出す際、`hasInvestmentStyle = false` なら `required = true`

### 4. `TermsModal` をダッシュボードから削除

- ファイル: `/app/dashboard/DashboardClient.tsx`
- 変更:
  - `TermsModal` の import と使用箇所を削除
  - `showTermsModal` state を削除
  - `?showTerms=true` パラメータ対応を削除

### 5. 不要なコードの削除

- `localStorage.getItem("hasSeenInvestmentStyleModal")` の削除
- 関連する useEffect ロジックの整理

## ファイル変更一覧

| ファイル | 変更内容 |
|---------|---------|
| `/app/terms-acceptance/page.tsx` | 新規作成 |
| `/middleware.ts` | リダイレクトロジック追加 |
| `/app/components/InvestmentStyleModal.tsx` | `required` プロパティ追加 |
| `/app/dashboard/DashboardClient.tsx` | TermsModal削除、モーダル制御修正 |
| `/app/components/TermsModal.tsx` | 削除（または保持して設定ページから使用） |
