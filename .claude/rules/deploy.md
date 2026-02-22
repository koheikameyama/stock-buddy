# デプロイフロー

**本番環境へのデプロイは自動化されています。**

## 基本フロー

1. ローカルで開発・テスト
2. `git push origin main` でGitHubにプッシュ
3. → Railway が自動的にデプロイ
4. → マイグレーションも自動実行される

## ❌ やってはいけないこと

- 本番DBに直接マイグレーションを実行しない
- `DATABASE_URL="postgresql://..." npx prisma migrate deploy` は不要
- **Claude Codeは本番DBへのマイグレーション操作を一切行わない**
  - `prisma migrate resolve --applied` を本番DBに対して実行しない
  - 本番DBに直接SQLを実行しない
  - マイグレーションが必要な場合はユーザーに依頼する

## ✅ 正しい手順

```bash
# ローカルでマイグレーション作成
npx prisma migrate dev --name <変更内容>

# または手動マイグレーション作成（シャドウDBエラー時）
mkdir -p prisma/migrations/YYYYMMDDHHMMSS_<変更内容>
cat > prisma/migrations/YYYYMMDDHHMMSS_<変更内容>/migration.sql << 'EOF'
-- マイグレーションSQL（IF NOT EXISTS推奨）
EOF
npx prisma migrate resolve --applied YYYYMMDDHHMMSS_<変更内容>

# ローカルでPrisma Clientを再生成
npx prisma generate

# GitHubにプッシュ（これだけでデプロイ完了）
git push origin main
```

## Railway自動デプロイの仕組み

- `main` ブランチへのプッシュをトリガーに自動ビルド
- ビルド時に `prisma migrate deploy` が自動実行される
- 環境変数 `DATABASE_URL` は Railway が自動設定
