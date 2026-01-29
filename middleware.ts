import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  // ダッシュボードにアクセスしようとしているが、ログインしていない場合
  if (pathname.startsWith("/dashboard") && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  // ログイン済みユーザーがルートやaboutページにアクセスした場合、ダッシュボードにリダイレクト
  if (isLoggedIn && (pathname === "/" || pathname.startsWith("/about"))) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  return NextResponse.next()
})

export const config = {
  // ダッシュボード、ルート、aboutページにマッチング
  matcher: ["/dashboard/:path*", "/", "/about/:path*"],
}
