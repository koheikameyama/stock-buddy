# Google AdSense統合設計

**作成日**: 2026-02-05

## 概要

Google AdSenseの自動広告をStock Buddyに統合する。特定のページでは広告を非表示にし、ユーザー体験を損なわないように配慮する。

## 要件

### 広告表示方式
- Google AdSenseの自動広告機能を使用
- 遅延読み込み（lazyOnload）でパフォーマンスを最適化

### 広告を非表示にするページ
- `/` - LPページ
- `/login` - ログインページ
- `/dashboard/settings` - 設定ページ
- `/about/stock-selection` - 銘柄選定について
- `/privacy` - プライバシーポリシー
- `/terms` - 利用規約
- `/disclaimer` - 免責事項
- `/maintenance` - メンテナンスページ

### 広告を表示するページ
- `/dashboard` - メインダッシュボード
- `/dashboard/stock-request` - 銘柄リクエスト
- `/my-stocks` - マイ株一覧・詳細

## 設計

### アーキテクチャ

**共通コンポーネント + パス判定方式**

`app/layout.tsx`に広告コンポーネントを配置し、クライアント側でパス判定を行う。

### ファイル構成

```
app/
├── components/
│   └── AdSense.tsx          # 新規作成
└── layout.tsx               # 修正
```

### AdSenseコンポーネント

**ファイル**: `app/components/AdSense.tsx`

```tsx
'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'

export default function AdSense() {
  const pathname = usePathname()

  // 広告を非表示にするパス
  const hideAdsPaths = [
    '/',                      // LP
    '/login',                 // ログイン
    '/dashboard/settings',    // 設定
    '/about/stock-selection', // 銘柄選定について
    '/privacy',               // プライバシーポリシー
    '/terms',                 // 利用規約
    '/disclaimer',            // 免責事項
    '/maintenance'            // メンテナンスページ
  ]

  if (hideAdsPaths.includes(pathname)) {
    return null
  }

  return (
    <Script
      async
      src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7558679080857597"
      crossOrigin="anonymous"
      strategy="lazyOnload"
    />
  )
}
```

**技術的な選択：**
- `'use client'`: クライアントコンポーネント（usePathnameを使用するため）
- `usePathname()`: Next.js App Routerのフックで現在のパスを取得
- `strategy="lazyOnload"`: ページ読み込み完了後にスクリプトを読み込み（PWAの初期表示速度を優先）
- `crossOrigin="anonymous"`: CORS設定

### layout.tsxの修正

**ファイル**: `app/layout.tsx`

```tsx
import AdSense from './components/AdSense'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="icon" type="image/png" href="/favicon.png" />
      </head>
      <body className="antialiased">
        {children}
        <PWARegister />
        <GlobalChatWrapper />
        <AdSense />  {/* 追加 */}
      </body>
    </html>
  )
}
```

## データフロー

1. ユーザーがページにアクセス
2. `app/layout.tsx`がレンダリングされ、`AdSense`コンポーネントがマウント
3. `usePathname()`で現在のURLパスを取得
4. パスが`hideAdsPaths`に含まれるかチェック
5. 含まれる場合: `null`を返す（広告非表示）
6. 含まれない場合: Google AdSenseスクリプトを遅延読み込み
7. Google AdSenseが自動で最適な位置に広告を配置

## エラーハンドリング

- AdSenseスクリプトの読み込み失敗は、Next.jsの`Script`コンポーネントが自動的に処理
- パス判定の失敗リスクは低い（静的な配列比較）

## パフォーマンス考慮

- `strategy="lazyOnload"`: ページの初期表示に影響しない
- PWAアプリとして、初期表示速度を最優先
- スクリプトはページ読み込み完了後に非同期で読み込まれる

## テスト計画

### 動作確認

1. **広告表示ページ**
   - `/dashboard`: 広告スクリプトが読み込まれること
   - `/my-stocks`: 広告スクリプトが読み込まれること

2. **広告非表示ページ**
   - `/`: 広告スクリプトが読み込まれないこと
   - `/login`: 広告スクリプトが読み込まれないこと
   - `/dashboard/settings`: 広告スクリプトが読み込まれないこと
   - その他非表示指定ページ

3. **パフォーマンス**
   - Lighthouse スコアが低下しないこと
   - 初期表示速度に影響しないこと

### 確認方法

- ブラウザの開発者ツールでNetworkタブを確認
- AdSenseスクリプトの読み込みタイミングを確認
- 実際に広告が表示されるか確認（AdSense審査通過後）

## 今後の拡張性

### 広告配置の追加

将来的に手動広告ユニットを追加する場合：

```tsx
// 例: 記事下に広告を配置
<ins className="adsbygoogle"
     style={{ display: 'block' }}
     data-ad-client="ca-pub-7558679080857597"
     data-ad-slot="1234567890"
     data-ad-format="auto"></ins>
```

### 環境変数化

本番/開発環境で切り替える場合：

```tsx
const isProduction = process.env.NODE_ENV === 'production'
if (!isProduction) return null
```

### A/Bテスト

広告表示/非表示のA/Bテストを行う場合は、パス判定ロジックを関数化して条件を追加。

## セキュリティ

- AdSenseスクリプトは公式のGoogleドメインから読み込み
- `crossOrigin="anonymous"`: クロスオリジン設定で安全性を確保
- 外部スクリプトのインジェクション攻撃のリスクなし（静的URL）

## 実装チェックリスト

- [ ] `app/components/AdSense.tsx`を作成
- [ ] `app/layout.tsx`にAdSenseコンポーネントを追加
- [ ] 広告非表示ページで動作確認
- [ ] 広告表示ページで動作確認
- [ ] Lighthouseスコア確認
- [ ] 本番環境でデプロイ
- [ ] Google AdSenseダッシュボードで広告配信を確認
