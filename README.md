# Stock Buddy

株式投資初心者向けのAI投資アシスタントサービス。

**任せるから、増える**

AIに任せて、毎日ちょっと分かる投資。

## 技術スタック

- **Frontend/Backend**: Next.js 14 (App Router), TypeScript, TailwindCSS
- **認証**: NextAuth.js (Google OAuth)
- **Database**: PostgreSQL (Prisma ORM)
- **AI**: OpenAI GPT-4
- **株価データ**: yfinance (Python)
- **技術指標**: technicalindicators (npm)
- **インフラ**: Railway

## セットアップ

### 1. 環境変数の設定

`.env.example`をコピーして`.env`を作成し、必要な値を設定します。

```bash
cp .env.example .env
```

### 2. データベースのセットアップ

Railwayで PostgreSQLデータベースを作成し、接続URLを`.env`の`DATABASE_URL`に設定します。

### 3. 依存パッケージのインストール

```bash
# Node.js パッケージ
npm install

# Python パッケージ
pip install -r scripts/requirements.txt
```

### 4. Prisma マイグレーション

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. 初期データ投入

```bash
python scripts/init_data.py
```

### 6. 開発サーバーの起動

```bash
npm run dev
```

http://localhost:3000 でアプリケーションにアクセスできます。

## プロジェクト構成

```
stock-buddy/
├─ app/                    # Next.js App Router
│  ├─ (auth)/             # 認証関連ページ
│  ├─ dashboard/          # ダッシュボード
│  ├─ portfolio/          # ポートフォリオ
│  └─ api/                # API Routes
├─ components/            # Reactコンポーネント
├─ lib/                   # ユーティリティ
├─ prisma/                # Prisma schema & migrations
├─ scripts/               # Pythonスクリプト
└─ docs/                  # ドキュメント
```

## スクリプト

### 株価データ取得（Cron実行用）

```bash
python scripts/fetch_stocks.py
```

毎日17:00 JSTに実行され、全銘柄の株価データを取得します。

### 初期データ投入

```bash
python scripts/init_data.py
```

主要銘柄を登録し、過去2年分の株価データを取得します。

## デプロイ（Railway）

1. Railwayプロジェクトを作成
2. PostgreSQLサービスを追加
3. Next.jsサービスを追加
4. Cron Jobを設定（毎日17:00 JST = 08:00 UTC）
   - スケジュール: `0 8 * * *`
   - コマンド: `cd /app && python scripts/fetch_stocks.py`
5. 環境変数を設定

## ドキュメント

- [仕様書](docs/specification.md)
- [設計書](docs/plans/2026-01-27-stockbuddy-design.md)

## ライセンス

Private
