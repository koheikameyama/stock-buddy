"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

export default function AdSense() {
  const pathname = usePathname();

  // 広告を非表示にするパス
  const hideAdsPaths = [
    "/", // LP
    "/login", // ログイン
    "/settings", // 設定
    "/privacy", // プライバシーポリシー
    "/terms", // 利用規約
    "/disclaimer", // 免責事項
    "/notifications", // 通知（アラート目的）
    "/menu", // メニュー（ナビゲーション目的）
    "/terms-acceptance", // 規約同意（行動目的）
    "/ai-report", // AIレポート（低価値コンテンツ回避）
    "/admin", // 管理画面（非公開コンテンツ/低価値）
  ];

  // 完全一致または前方一致で非表示にする
  if (
    hideAdsPaths.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  ) {
    return null;
  }

  return (
    <Script
      async
      src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7558679080857597"
      crossOrigin="anonymous"
      strategy="lazyOnload"
    />
  );
}
