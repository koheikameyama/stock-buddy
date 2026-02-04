"use client"

import { usePathname } from "next/navigation"
import GlobalChat from "./GlobalChat"

// チャットを表示しないページ
const EXCLUDED_PATHS = ["/login", "/register", "/"]

export default function GlobalChatWrapper() {
  const pathname = usePathname()

  // 除外ページではチャットを表示しない
  if (EXCLUDED_PATHS.includes(pathname)) {
    return null
  }

  return <GlobalChat />
}
