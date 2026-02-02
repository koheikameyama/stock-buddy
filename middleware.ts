import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl

  // メンテナンスモードチェック
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === "true"

  if (isMaintenanceMode && pathname !== "/maintenance") {
    return NextResponse.redirect(new URL("/maintenance", req.url))
  }

  // メンテナンス画面からの戻り
  if (!isMaintenanceMode && pathname === "/maintenance") {
    return NextResponse.redirect(new URL("/", req.url))
  }

  const isLoggedIn = !!req.auth

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
  // ダッシュボード、ルート、about、maintenanceページにマッチング
  matcher: ["/dashboard/:path*", "/", "/about/:path*", "/maintenance"],
}
