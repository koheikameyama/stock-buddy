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

#### 初心者向けの定義

**初心者向け ≠ 難しい言葉や論理を避ける**

- ✅ 複雑な指標も入れつつ、わかりやすく提示する
- ✅ 専門用語を使い、その意味と評価を添える
- ✅ 使いながら自然と専門用語を覚えていける設計

**表示形式の例:**
```
シャープレシオ: 1.2
（リスクに対するリターンの効率。1以上で優秀）
→ あなたのポートフォリオは効率よくリターンを得ています
```

1. **指標名** - 専門用語そのまま
2. **解説** - その指標が何を意味するか
3. **評価** - 良い/普通/注意など
4. **アクション** - 次に何をすべきか

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
- **Claude Codeは本番DBへのマイグレーション操作を一切行わない**
  - `prisma migrate resolve --applied` を本番DBに対して実行しない
  - 本番DBに直接SQLを実行しない
  - マイグレーションが必要な場合はユーザーに依頼する

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

**日付の保存・取得はJST（日本時間）00:00を基準に統一してください。**

### 方針

- **DBにはUTC形式で保存**される
- **日付の境界はJST 00:00:00**（日本時間の深夜0時で日付が変わる）
- 共通ユーティリティ `lib/date-utils.ts` を使用する

### なぜJST基準か

- 日本株を扱うアプリなので、JSTで日付を区切るのが自然
- ユーザーが「今日のおすすめ」と言ったらJSTの今日を期待する
- 市場の営業日もJST基準

### 共通ユーティリティ

```typescript
// lib/date-utils.ts
import { getTodayForDB, getDaysAgoForDB } from "@/lib/date-utils"

// 今日の日付（JST 00:00をUTCに変換）
const today = getTodayForDB()
// 例: JST 2024-06-10 00:00:00 → UTC 2024-06-09 15:00:00

// N日前の日付
const sevenDaysAgo = getDaysAgoForDB(7)
```

```python
# Python版: scripts/lib/date_utils.py
from scripts.lib.date_utils import get_today_for_db, get_days_ago_for_db

today = get_today_for_db()
seven_days_ago = get_days_ago_for_db(7)
```

### ✅ 良い例

```typescript
import { getTodayForDB, getDaysAgoForDB } from "@/lib/date-utils"

// DB保存
await prisma.dailyFeaturedStock.create({
  data: {
    date: getTodayForDB(),
    stockId: stock.id,
  },
})

// DB検索
const recommendations = await prisma.userDailyRecommendation.findMany({
  where: {
    date: getTodayForDB(),
  },
})

// 範囲検索
const recentData = await prisma.purchaseRecommendation.findFirst({
  where: {
    date: { gte: getDaysAgoForDB(7) },
  },
})
```

### ❌ 悪い例

```typescript
// UTC 00:00を使用 - JSTと9時間ずれる
const today = dayjs.utc().startOf("day").toDate()

// 生のDateを使用 - タイムゾーンが曖昧
const today = new Date()
today.setHours(0, 0, 0, 0)
```

### 対象テーブル

以下のテーブルは `@db.Date` 型で日付を保存しており、JST基準で統一：

- `DailyFeaturedStock.date` - 今日の注目銘柄
- `PurchaseRecommendation.date` - 購入判断
- `UserDailyRecommendation.date` - あなたへのおすすめ

### 注意事項

- **タイムスタンプ（createdAt, updatedAt等）**: `new Date()` でOK（現在時刻なのでTZ関係なし）
- **日付フィールド（date型）**: 必ず `getTodayForDB()` を使用
- **日付フォーマット表示**: `dayjs().tz("Asia/Tokyo").format("YYYY-MM-DD")`

**重要: 日付を保存・検索する際は、必ず共通ユーティリティを使用してください。**

## データ取得とローディング表示

**データ取得は基本的に非同期にしてスケルトン表示してください。**

### 理由

1. **UX向上**: ページ全体がブロックされず、ユーザーが待機状態を認識できる
2. **体感速度**: スケルトンがあると読み込みが速く感じる
3. **レイアウトシフト防止**: スケルトンがコンテンツと同じサイズを確保

### 基本パターン

```typescript
// ✅ 良い例: Suspenseとスケルトンを使用
import { Suspense } from "react"
import { StockListSkeleton } from "@/components/skeletons"

export default function Page() {
  return (
    <Suspense fallback={<StockListSkeleton />}>
      <StockList />
    </Suspense>
  )
}

// データ取得コンポーネント（Server Component）
async function StockList() {
  const stocks = await fetchStocks()
  return <StockListContent stocks={stocks} />
}
```

```typescript
// ❌ 悪い例: ページ全体でawait
export default async function Page() {
  const stocks = await fetchStocks() // ページ全体がブロック
  return <StockListContent stocks={stocks} />
}
```

### スケルトンコンポーネント

スケルトンは `components/skeletons/` に配置してください。

```typescript
// components/skeletons/stock-list-skeleton.tsx
export function StockListSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
      ))}
    </div>
  )
}
```

### チェックリスト

新しいページ・コンポーネント作成時：
- [ ] データ取得は別コンポーネントに分離
- [ ] `Suspense` でラップ
- [ ] 適切なスケルトンを `fallback` に指定
- [ ] スケルトンのサイズは実コンテンツと同じにする

**重要: データ取得を伴うUIには必ずスケルトン表示を実装してください。**

## LLM API連携

**LLM（OpenAI等）からの出力は必ず構造化してください。**

### 理由

1. **精度向上**: 構造化出力により、LLMが明確な形式で回答するため精度が上がる
2. **パース容易**: JSONスキーマに従った出力なのでパースエラーが発生しない
3. **型安全**: TypeScriptで型定義でき、フロントエンドで安全に扱える

### 基本パターン（OpenAI）

```python
# ✅ 良い例: 構造化出力を使用
SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "improvement_suggestion",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "target": {"type": "string", "description": "改善対象"},
                "action": {"type": "string", "enum": ["強化", "見直し", "調整"]},
                "reason": {"type": "string", "description": "理由"}
            },
            "required": ["target", "action", "reason"],
            "additionalProperties": False
        }
    }
}

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[...],
    response_format=SCHEMA,  # 構造化出力を指定
)
result = json.loads(response.choices[0].message.content)
```

```python
# ❌ 悪い例: 自由形式のテキスト出力
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "user", "content": "改善ポイントを1行で出力してください"}
    ],
)
text = response.choices[0].message.content  # パースしにくい
```

### チェックリスト

LLM API連携を実装する際：
- [ ] 出力形式をJSON Schemaで定義
- [ ] `response_format` パラメータで構造化出力を指定
- [ ] TypeScript側で対応する型定義を作成
- [ ] 旧形式との後方互換性を考慮（必要に応じて）

**重要: LLMからの出力は必ず構造化し、型安全に扱ってください。**
