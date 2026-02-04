import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl

  const isLoggedIn = !!req.auth

  // ダッシュボードにアクセスしようとしているが、ログインしていない場合
  if (pathname.startsWith("/dashboard") && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  // ログイン済みユーザーがルートページにアクセスした場合、ダッシュボードにリダイレクト
  if (isLoggedIn && pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  return NextResponse.next()
})

export const config = {
  // ダッシュボードとルートページにマッチング
  matcher: ["/dashboard/:path*", "/"],
}
