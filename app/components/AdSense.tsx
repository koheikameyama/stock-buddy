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
