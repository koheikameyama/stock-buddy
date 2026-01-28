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
    async session({ session, user }) {
      // セッションにユーザーIDを追加
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      // ログイン後の処理
      if (url.startsWith(baseUrl)) {
        // 既にbaseURLで始まる場合はそのまま返す
        return url
      }
      // それ以外の場合はオンボーディングページにリダイレクト
      return `${baseUrl}/onboarding`
    },
  },
  trustHost: true,
})
