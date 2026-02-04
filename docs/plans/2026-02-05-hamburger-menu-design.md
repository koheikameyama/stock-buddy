# ハンバーガーメニュー設計

**作成日**: 2026-02-05

## 概要

Headerの設定とログアウトをハンバーガーメニューに統合する。デスクトップ・モバイル両方で統一したUI/UXを提供する。

## 要件

### 表示方式
- デスクトップ・モバイル両方でハンバーガーメニューを表示
- 右からスライドインするメニュー
- メニュー内容：設定とログアウトのみ

### 操作
- ハンバーガーアイコンをクリックでメニューを開く
- オーバーレイクリックまたはESCキーで閉じる
- メニュー項目クリックで自動的に閉じる

## 設計

### アーキテクチャ

**Server Component + Client Component分離**

- `Header.tsx`: Server Componentでセッション取得とServer Action定義
- `HamburgerMenu.tsx`: Client Componentでメニュー開閉のstate管理

### ファイル構成

```
app/components/
├── Header.tsx          # 修正（Server Component）
└── HamburgerMenu.tsx   # 新規作成（Client Component）
```

### HamburgerMenu.tsx

**責務:**
- メニューの開閉状態管理（useState）
- スライドアニメーション
- オーバーレイ表示
- ESCキーでの閉じる処理

**Props:**
```typescript
type Props = {
  signOutAction: () => Promise<void>
}
```

**主要機能:**

1. **ハンバーガーアイコン**
   - 三本線のSVGアイコン
   - クリックでメニューを開く

2. **オーバーレイ**
   - 背景を半透明の黒で覆う
   - クリックでメニューを閉じる
   - z-index: 40

3. **スライドメニュー**
   - 画面右端から幅264px（w-64）でスライドイン
   - Tailwind CSS の `transform` と `transition` でアニメーション
   - `translate-x-full` → `translate-x-0` の切り替え
   - z-index: 50（オーバーレイより上）

4. **メニュー内容**
   - 閉じるボタン（✕）
   - 設定リンク（アイコン + テキスト）
   - ログアウトボタン（アイコン + テキスト）

**実装例:**

```tsx
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Props = {
  signOutAction: () => Promise<void>
}

export default function HamburgerMenu({ signOutAction }: Props) {
  const [isOpen, setIsOpen] = useState(false)

  // ESCキーで閉じる
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen])

  return (
    <>
      {/* ハンバーガーアイコン */}
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 text-gray-700 hover:text-blue-600 transition-colors"
        aria-label="メニューを開く"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* オーバーレイ */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 z-40"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* スライドメニュー */}
      <div
        className={`
          fixed top-0 right-0 h-full w-64 bg-white shadow-xl z-50
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* ヘッダー（閉じるボタン） */}
        <div className="flex justify-end p-4 border-b border-gray-200">
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="メニューを閉じる"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* メニュー項目 */}
        <nav className="flex flex-col p-4 space-y-2">
          {/* 設定 */}
          <Link
            href="/settings"
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors text-gray-700"
            onClick={() => setIsOpen(false)}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="font-medium">設定</span>
          </Link>

          {/* ログアウト */}
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors text-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="font-medium">ログアウト</span>
            </button>
          </form>
        </nav>
      </div>
    </>
  )
}
```

### Header.tsx の修正

**変更点:**
1. 設定アイコンとログアウトボタンを削除
2. `HamburgerMenu`コンポーネントをインポートして配置
3. Server Actionの定義（`handleSignOut`）

**修正後:**

```tsx
import { auth, signOut } from "@/auth"
import Link from "next/link"
import HamburgerMenu from "./HamburgerMenu"

export default async function Header() {
  const session = await auth()

  async function handleSignOut() {
    'use server'
    await signOut({ redirectTo: "/" })
  }

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex justify-between items-center">
          {/* ロゴ・タイトル */}
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-2xl">📊</span>
            <span className="text-xl font-bold text-gray-900">Stock Buddy</span>
          </Link>

          {/* ハンバーガーメニュー */}
          {session?.user && (
            <HamburgerMenu signOutAction={handleSignOut} />
          )}
        </div>
      </div>
    </header>
  )
}
```

## データフロー

1. ユーザーがハンバーガーアイコンをクリック
2. `setIsOpen(true)` でメニューを開く
3. CSS transitionでスライドアニメーション実行
4. ユーザーがメニュー項目をクリック
   - 設定リンク: `/settings`に遷移 + `setIsOpen(false)`
   - ログアウトボタン: Server Action実行
5. オーバーレイクリックまたはESCキー: `setIsOpen(false)`

## アニメーション

**CSS Transition:**
```css
transform transition-transform duration-300 ease-in-out
```

**状態遷移:**
- 閉じている: `translate-x-full` (画面外右側)
- 開いている: `translate-x-0` (画面内)

## アクセシビリティ

- `aria-label`でボタンの目的を明示
- `aria-hidden`でオーバーレイを支援技術から隠す
- ESCキーでメニューを閉じる
- キーボード操作でメニュー項目にアクセス可能

## エラーハンドリング

- Server Actionの失敗は Next.js が自動的に処理
- メニュー開閉のstate管理は失敗しない（クライアント側のみ）

## パフォーマンス考慮

- メニューは常にDOMに存在（`translate-x-full`で画面外に配置）
- 条件付きレンダリングはオーバーレイのみ
- アニメーションはGPUアクセラレーション（transform使用）

## テスト計画

### 動作確認

1. **メニューの開閉**
   - ハンバーガーアイコンクリックで開く
   - オーバーレイクリックで閉じる
   - ESCキーで閉じる
   - 閉じるボタンで閉じる

2. **メニュー項目**
   - 設定リンククリックで`/settings`に遷移
   - ログアウトボタンクリックでログアウト＆`/`にリダイレクト

3. **アニメーション**
   - スムーズにスライドイン/アウトする
   - 300msのアニメーション時間

4. **レスポンシブ**
   - デスクトップで動作する
   - モバイルで動作する

### 確認方法

- ブラウザの開発者ツールで動作確認
- モバイルビューでの表示確認
- キーボード操作でのアクセシビリティ確認

## 実装チェックリスト

- [ ] `app/components/HamburgerMenu.tsx`を作成
- [ ] `app/components/Header.tsx`を修正
- [ ] メニューの開閉動作確認
- [ ] アニメーション確認
- [ ] ログアウト動作確認
- [ ] ESCキーで閉じる確認
- [ ] ビルド確認
- [ ] コミット＆プッシュ
