import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isDashboard = req.nextUrl.pathname.startsWith("/dashboard")

  // ダッシュボードにアクセスしようとしているが、ログインしていない場合
  if (isDashboard && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return NextResponse.next()
})

export const config = {
  // ダッシュボード以下だけ認証が必要
  matcher: ["/dashboard/:path*"],
}
