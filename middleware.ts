import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl

  const isLoggedIn = !!req.auth

  // ダッシュボードまたは設定にアクセスしようとしているが、ログインしていない場合
  if ((pathname.startsWith("/dashboard") || pathname.startsWith("/settings")) && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  // 管理者ページへのアクセス制御
  if (pathname.startsWith("/admin")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", req.url))
    }
    const role = (req.auth?.user as { role?: string })?.role
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }
  }

  // ログイン済みユーザーがルートページにアクセスした場合、ダッシュボードにリダイレクト
  if (isLoggedIn && pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  return NextResponse.next()
})

export const config = {
  // ダッシュボード、設定、管理者、ルートページにマッチング
  matcher: ["/dashboard/:path*", "/settings", "/admin/:path*", "/"],
}
