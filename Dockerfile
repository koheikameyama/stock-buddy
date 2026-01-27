# ベースイメージ
FROM node:20-alpine AS base

# 依存関係のインストール
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# 依存関係ファイルとPrisma schemaをコピー
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# ビルダー
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 環境変数（ビルド時）
ENV NEXT_TELEMETRY_DISABLED=1

# Prisma Clientを生成してビルド
RUN npx prisma generate
RUN npm run build

# ランナー
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# publicディレクトリを作成（Next.jsで必要）
RUN mkdir -p /app/public

# 必要なファイルをコピー
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# node_modulesの一部をコピー（prisma cliに必要）
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin

# 所有権を変更
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# サーバー起動（railway.jsonのstartCommandで上書きされる）
# デフォルトはマイグレーション付き起動
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
