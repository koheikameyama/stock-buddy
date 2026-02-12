# Stock Buddy プロジェクト固有の設定

## プロダクトコンセプト

### ターゲットユーザー

**投資初心者〜トレーダー志望 - 「学びながら成長したい」人**
- 投資に興味があり、これからトレードしていきたい
- 専門用語も含めて投資の知識を身につけたい
- 実践的なスキルを段階的に学びたい
- リスクを理解した上で自分で判断できるようになりたい

### コアバリュー

1. **寄り添う**
   - 「投資、始めたいけど怖い？大丈夫です。一緒に学びながら成長しましょう」
   - AIコーチが毎日優しく声をかける
   - 専門用語には必ず解説を添える

2. **学べる**
   - テクニカル分析（チャートパターン、RSI、MACDなど）を解説付きで提供
   - 「なぜこのシグナルが出ているのか」を理解できる
   - 使いながら投資の知識が自然と身につく

3. **シンプル**
   - 質問は最小限（予算と期間だけ）
   - 選択肢を増やして迷わせない
   - お任せ感を大切に

4. **安心**
   - シミュレーション機能で練習できる
   - 5銘柄までの制限でリスクを管理
   - 初心者向けスコアで優良銘柄を提案

### 設計思想

#### ❌ やってはいけないこと
- 専門用語を解説なしで使う（用語には必ず説明を添える）
- 選択肢を増やす（銘柄数、リスク許容度の詳細など）
- ユーザーに判断を委ねすぎる
- 複雑な機能を追加する

#### ✅ やるべきこと
- 専門用語＋分かりやすい解説をセットで提供（例:「ダブルボトム（2回底を打って反転する買いパターン）」）
- 自動で最適な提案をする（予算と期間から銘柄数を決定）
- テクニカル分析の結果を初心者が理解できる形で表示
- 迷わせない導線設計
- シンプルで分かりやすいUI

### 機能方針

#### オンボーディング
- 質問は2つだけ（予算・期間）
- 銘柄数は自動決定（初心者が迷わないように）
- 提案は3択（実際に購入/シミュレーション/ウォッチリスト）

#### AI提案ロジック
- 投資期間に応じた分散投資
  - 長期: 4-5銘柄（リスク分散重視）
  - 中期: 3-4銘柄（バランス）
  - 短期: 2-3銘柄（機動性重視）
- 予算内で購入可能な銘柄から高スコア順に選択
- 初心者向けスコアを重視

#### 制限設計
- ポートフォリオ: 最大5銘柄
- ウォッチリスト: 最大5銘柄
- 理由: 初心者が管理しやすい範囲に制限

## デプロイフロー

**本番環境へのデプロイは自動化されています。**

### 基本フロー

1. ローカルで開発・テスト
2. `git push origin main` でGitHubにプッシュ
3. → Railway が自動的にデプロイ
4. → マイグレーションも自動実行される

### ❌ やってはいけないこと

- 本番DBに直接マイグレーションを実行しない
- `DATABASE_URL="postgresql://..." npx prisma migrate deploy` は不要

### ✅ 正しい手順

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

### Railway自動デプロイの仕組み

- `main` ブランチへのプッシュをトリガーに自動ビルド
- ビルド時に `prisma migrate deploy` が自動実行される
- 環境変数 `DATABASE_URL` は Railway が自動設定

## GitHub Actions

### スクリプト言語の選択

**GitHub Actionsでスクリプトを作成する場合は必ずPythonを使用してください。**

#### 理由

1. **エラーハンドリング**: try-exceptで詳細なエラー処理が可能
2. **ログ出力**: 進捗状況を詳細に表示できる
3. **保守性**: コードが読みやすく、修正しやすい
4. **YAML干渉回避**: heredoc構文によるYAMLパーサーエラーを防げる

#### ✅ 良い例（Python）

```yaml
- name: Generate daily reports
  env:
    APP_URL: ${{ secrets.APP_URL }}
    CRON_SECRET: ${{ secrets.CRON_SECRET }}
  run: python scripts/generate_daily_report.py
```

```python
# scripts/generate_daily_report.py
import requests
import sys
import os

def generate_reports(app_url: str, cron_secret: str):
    try:
        response = requests.post(
            f"{app_url}/api/reports/generate-all",
            headers={"Authorization": f"Bearer {cron_secret}"},
            timeout=180
        )

        if response.status_code not in [200, 201]:
            print(f"Error: {response.text}")
            sys.exit(1)

        print("✅ Reports generated successfully")
        return response.json()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    app_url = os.getenv("APP_URL")
    cron_secret = os.getenv("CRON_SECRET")
    generate_reports(app_url, cron_secret)
```

#### ❌ 悪い例（curl + heredoc）

```yaml
- name: Generate daily reports
  run: |
    curl -X POST "$APP_URL/api/reports/generate-all" \
      -H "Authorization: Bearer $CRON_SECRET" \
      -d "$(cat <<'EOF'
    {
      "key": "value"
    }
    EOF
    )"
```

**問題点:**
- YAMLパーサーがheredocのクォートを誤解釈
- エラーハンドリングが困難
- ログ出力が不十分
- 保守性が低い

### 既存のPythonスクリプト

プロジェクトには以下のPythonスクリプトがあります：

- `scripts/generate_daily_analysis.py` - 日次分析実行
- `scripts/generate_daily_report.py` - 週次レポート生成
- `scripts/generate_featured_stocks.py` - 今日の注目銘柄生成
- `scripts/fetch_stocks.py` - 株価データ取得
- `scripts/init_data.py` - 初期データ投入

新しいGitHub Actionsワークフローを作成する場合は、これらを参考にPythonスクリプトを作成してください。

### Slack通知

**GitHub Actionsワークフローには必ずSlack通知を追加してください。**

#### 標準パターン

```yaml
      - name: Notify Slack on success
        if: success()
        uses: rtCamp/action-slack-notify@v2
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK_URL }}
          SLACK_TITLE: "✅ [処理名]に成功しました"
          SLACK_MESSAGE: |
            処理の詳細メッセージ ✅
          SLACK_COLOR: good
          SLACK_FOOTER: "Stock Buddy"

      - name: Notify Slack on failure
        if: failure()
        uses: rtCamp/action-slack-notify@v2
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK_URL }}
          SLACK_TITLE: "❌ [処理名]に失敗しました"
          SLACK_MESSAGE: |
            処理中にエラーが発生しました
            詳細はGitHub Actionsログを確認してください
          SLACK_COLOR: danger
          SLACK_FOOTER: "Stock Buddy"
```

#### ルール

1. **成功時**: `if: success()` で緑色（`good`）通知
2. **失敗時**: `if: failure()` で赤色（`danger`）通知
3. **アクション**: `rtCamp/action-slack-notify@v2` を使用
4. **Webhook**: `secrets.SLACK_WEBHOOK_URL` を使用
5. **フッター**: 必ず `"Stock Buddy"` を設定

#### チェックリスト

新しいワークフロー作成時：
- [ ] 成功時のSlack通知を追加
- [ ] 失敗時のSlack通知を追加
- [ ] タイトルに処理内容を明記
- [ ] メッセージに適切な詳細を記載

## データベース

### ローカル環境

```bash
# ローカルPostgreSQL
postgresql://kouheikameyama@localhost:5432/stock_buddy
```

### 本番環境

- Railway でホスト
- 接続情報は `.env` に記載（Gitにはコミットしない）
- 直接操作は避ける（デプロイフローに任せる）

## 日付・時刻の扱い

**JavaScriptの`Date`オブジェクトではなく、dayjsを使用してください。**

### 理由

1. **タイムゾーン処理が明確**: UTCとJSTの変換が簡単
2. **可読性**: `dayjs.utc().startOf("day")` は意図が明確
3. **不変性**: 元のオブジェクトを変更しない
4. **バグ防止**: Dateオブジェクトの複雑な挙動を回避

### 基本的な使い方

```typescript
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

// ✅ 良い例: dayjsを使用
const today = dayjs.utc().startOf("day").toDate()
const yesterday = dayjs.utc().subtract(1, "day").startOf("day").toDate()
const jstNow = dayjs().tz("Asia/Tokyo")

// ❌ 悪い例: Dateオブジェクトを使用
const today = new Date()
today.setHours(0, 0, 0, 0)
const yesterday = new Date(today)
yesterday.setDate(yesterday.getDate() - 1)
```

### よくあるパターン

#### 今日の日付（UTC 00:00:00）
```typescript
const today = dayjs.utc().startOf("day").toDate()
```

#### 日本時間の現在時刻
```typescript
const jstNow = dayjs().tz("Asia/Tokyo")
```

#### 日付範囲検索
```typescript
const startDate = dayjs.utc().subtract(7, "day").startOf("day").toDate()
const endDate = dayjs.utc().endOf("day").toDate()

const records = await prisma.record.findMany({
  where: {
    date: {
      gte: startDate,
      lte: endDate,
    },
  },
})
```

#### 日付フォーマット
```typescript
// ✅ dayjsを使用
const formatted = dayjs().format("YYYY-MM-DD HH:mm:ss")

// ❌ Dateオブジェクトを使用
const formatted = new Date().toISOString() // ISO形式固定
```

### Prismaでの日付扱い

Prismaの `DateTime` 型はUTC基準で保存されます。dayjsで `.toDate()` を呼ぶと、Prismaが期待する形式に変換されます。

```typescript
// ✅ 正しい
const record = await prisma.record.create({
  data: {
    date: dayjs.utc().startOf("day").toDate(),
    createdAt: dayjs().toDate(), // 現在時刻
  },
})

// ❌ 間違い
const record = await prisma.record.create({
  data: {
    date: new Date(), // タイムゾーンが曖昧
  },
})
```

### 注意事項

- **タイムスタンプ（createdAt, updatedAt等）**: `dayjs().toDate()` または `new Date()` でOK
- **日付比較・計算**: 必ずdayjsを使用
- **プラグイン**: utcとtimezoneプラグインを必ず読み込む

**重要: 日付・時刻を扱うコードを書く際は、必ずdayjsを使用してください。**
