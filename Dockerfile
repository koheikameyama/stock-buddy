# ベースイメージ
FROM node:20-alpine AS base

# 依存関係のインストール
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# 依存関係ファイルとPrisma schemaをコピー
COPY package.json package-lock.json* ./
COPY prisma ./prisma
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

# ビルド確認（デバッグ用）
RUN echo "=== Build output ===" && \
    ls -la .next/ && \
    echo "=== Standalone check ===" && \
    ls -la .next/standalone/ || echo "No standalone directory"

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
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./

# publicディレクトリもコピー
COPY --from=builder /app/public ./public

# 所有権を変更
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# サーバー起動（マイグレーションはRailwayのpre-deploy commandで実行）
CMD ["npm", "start"]
