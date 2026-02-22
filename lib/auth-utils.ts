import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import type { User } from "@prisma/client"

type AuthResult =
  | { user: User; error?: never }
  | { user?: never; error: NextResponse }

/**
 * セッションからDBのユーザーを取得する共通関数（APIルート用）。
 * email → DB検索でユーザーを特定することで、JWTのIDのズレに依存しない。
 * 未認証・ユーザー未存在の場合は NextResponse を返すので、呼び出し側で `if (error) return error` するだけでよい。
 */
export async function getAuthUser(): Promise<AuthResult> {
  const session = await auth()
  if (!session?.user?.email) {
    return {
      error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }),
    }
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })

  if (!user) {
    return {
      error: NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 },
      ),
    }
  }

  return { user }
}

export interface AuthenticatedUser {
  id: string
  email: string
  name?: string | null
}

/**
 * 認証済みユーザーを取得
 * 未認証の場合はnullを返す
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const session = await auth()
  if (!session?.user?.id) {
    return null
  }

  return {
    id: session.user.id,
    email: session.user.email || "",
    name: session.user.name,
  }
}

/**
 * 認証を必須とし、ユーザー情報を取得
 * 未認証の場合はUnauthorizedErrorをスロー
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser()
  if (!user) {
    throw new UnauthorizedError()
  }
  return user
}

/**
 * 認証済みユーザーのDB情報を取得
 * 未認証の場合はnullを返す
 */
export async function getAuthenticatedUserFromDB() {
  const session = await auth()
  if (!session?.user?.email) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })

  return user
}

/**
 * 認証エラー
 */
export class UnauthorizedError extends Error {
  public readonly statusCode = 401

  constructor(message = "Unauthorized") {
    super(message)
    this.name = "UnauthorizedError"
  }
}
