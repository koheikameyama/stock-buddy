import { NextRequest, NextResponse } from "next/server"

/**
 * CRON認証をチェックする
 * GitHub ActionsやCRONジョブからのリクエストを認証
 *
 * @param request - NextRequest
 * @returns null（認証成功）または NextResponse（認証失敗）
 */
export function verifyCronAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error("CRON_SECRET is not set")
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null // 認証成功
}

/**
 * CRON認証かセッション認証のいずれかを通過すればOK
 * - セッション認証: ブラウザからの手動実行
 * - CRON認証: GitHub Actionsからのバッチ実行
 *
 * @param request - NextRequest
 * @param session - セッション（auth()の結果）
 * @returns { isCron: boolean, userId: string | null } または NextResponse（認証失敗）
 */
export function verifyCronOrSession(
  request: NextRequest,
  session: { user?: { id?: string } } | null
): { isCron: boolean; userId: string | null } | NextResponse {
  // CRON認証をチェック
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { isCron: true, userId: null }
  }

  // セッション認証をチェック
  if (session?.user?.id) {
    return { isCron: false, userId: session.user.id }
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
