# ベースイメージ
FROM node:20-alpine AS base

# 依存関係のインストール
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# 依存関係ファイルとPrisma schemaをコピー
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# 依存関係をインストール
RUN npm ci --include=dev

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

# publicディレクトリを作成
RUN mkdir -p /app/public

# 必要なファイルをコピー
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# マイグレーション実行後にサーバー起動
CMD ["sh", "-c", "sh scripts/migrate-with-retry.sh && npm start"]
