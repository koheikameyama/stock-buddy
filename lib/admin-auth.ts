import { auth } from "@/auth"

/**
 * 管理者認証チェック
 * APIルートで使用する共通ユーティリティ
 */
export async function verifyAdmin(): Promise<{ authorized: true; userId: string } | { authorized: false; error: string; status: number }> {
  const session = await auth()

  if (!session?.user?.id) {
    return { authorized: false, error: "Unauthorized", status: 401 }
  }

  if (session.user.role !== "admin") {
    return { authorized: false, error: "Forbidden", status: 403 }
  }

  return { authorized: true, userId: session.user.id }
}
