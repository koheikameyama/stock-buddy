import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

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
