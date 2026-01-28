export { auth as middleware } from "@/auth"

export const config = {
  // ダッシュボード以下だけ認証が必要
  matcher: ["/dashboard/:path*"],
}
