import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login", // 認証エラー時もログインページにリダイレクト
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    authorized: async ({ auth }) => {
      // ログインしているユーザーのみアクセス可能
      return !!auth
    },
    async jwt({ token, user }) {
      // 初回ログイン時にユーザーIDをトークンに保存
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      // トークンからユーザーIDをセッションに追加
      if (session.user && token.id) {
        session.user.id = token.id as string
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      // ログイン後の処理
      if (url.startsWith(baseUrl)) {
        // 既にbaseURLで始まる場合はそのまま返す
        return url
      }
      // それ以外の場合はダッシュボードにリダイレクト
      return `${baseUrl}/dashboard`
    },
  },
  trustHost: true,
})
