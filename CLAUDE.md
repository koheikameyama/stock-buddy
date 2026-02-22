# Stock Buddy プロジェクト固有の設定

## プロダクトコンセプト

### サービス概要

**Stock Buddy** - 株式投資初心者向けのAI投資アシスタントサービス

**キャッチコピー**: 「任せて学んで、一緒に増やす」

AIに判断を任せながら、理由を理解できる投資。投資の知識がなくても、予算と期間を入れるだけでAIが最適な銘柄を提案。専門用語も解説付きで学びながら成長できる。

**デザインイメージ**:

- トーン: 親しみやすい、信頼感のある、落ち着いた
- カラー: 信頼・安定を表すブルー系ベース、成長・上昇を表すグリーンをアクセント
- イメージ: 初心者に寄り添うコーチ、一緒に成長するパートナー
- アイコン: 上昇チャート + 本（学習）を組み合わせたデザイン

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
   - 初心者向けスコアで優良銘柄を提案

### 設計思想

#### 基本原則: AIとルールの役割分担

**「危ない株は人間がルールで止め、チャンスの株はAIが見つける」**

- **AIの役割**: チャンス発見（おすすめ銘柄、買いシグナル、ポジティブな材料）
- **ルールの役割**: 危険な株の検出・警告（赤字、高ボラティリティ、急落など）

AIは「良い株を見つける」ことに集中し、「危ない株を止める」のはルールベースで行う。
これにより、AIの判断ミスによる損失リスクを軽減し、ユーザーに安心感を提供する。

**ルールベースの強制補正条件（買い推奨をstayに変更）:**

- 急騰銘柄（`weekChangeRate >= 30%`）
- 赤字 かつ 高ボラティリティ（`isProfitable === false` && `volatility > 50%`）

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

- ポートフォリオ: 最大100銘柄
- ウォッチリスト: 最大100銘柄
- 追跡銘柄: 最大10銘柄
- 制限値は `lib/constants.ts` で一元管理

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

### ワークフローのジョブ設計

**複数のタスクを実行するワークフローは、ジョブ（jobs）を分割してください。**

#### 理由

1. **再実行性**: 失敗したジョブから再実行できる（Re-run failed jobs）
2. **依存関係の明確化**: `needs` で実行順序を定義
3. **並列実行**: 独立したジョブは並列で実行される

#### 基本パターン

```yaml
jobs:
  task-a:
    runs-on: ubuntu-latest
    steps: ...

  task-b:
    needs: task-a # task-a の完了後に実行
    runs-on: ubuntu-latest
    steps: ...

  task-c:
    needs: task-a # task-b と並列実行可能
    runs-on: ubuntu-latest
    steps: ...

  notify:
    needs: [task-b, task-c]
    if: always() # 前のジョブが失敗しても実行
    runs-on: ubuntu-latest
    steps: ...
```

#### 条件付き実行

```yaml
jobs:
  determine-context:
    runs-on: ubuntu-latest
    outputs:
      context: ${{ steps.check.outputs.context }}
    steps:
      - id: check
        run: echo "context=close" >> $GITHUB_OUTPUT

  conditional-job:
    needs: determine-context
    if: needs.determine-context.outputs.context == 'close'
    runs-on: ubuntu-latest
    steps: ...
```

#### チェックリスト

新しいワークフロー作成時：

- [ ] 1つのジョブに複数の独立したタスクを詰め込まない
- [ ] `needs` で依存関係を定義
- [ ] 通知ジョブは `if: always()` で常に実行
- [ ] 条件付き実行が必要な場合は出力変数を使用

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

### 日付操作ライブラリ

**日付操作には必ず dayjs を使用してください。**

- TypeScript: `dayjs` + `dayjs/plugin/utc` + `dayjs/plugin/timezone`
- Python: `datetime` + `zoneinfo`
- 生の `Date` コンストラクタやタイムゾーン手動計算は使わない

### 共通ユーティリティ

```typescript
// lib/date-utils.ts
import { getTodayForDB, getDaysAgoForDB } from "@/lib/date-utils";

// 今日の日付（JST基準、UTC 00:00として保存）
const today = getTodayForDB();
// 例: JST 2024-06-10 → 2024-06-10T00:00:00.000Z → DB: 2024-06-10

// N日前の日付
const sevenDaysAgo = getDaysAgoForDB(7);
```

```python
# Python版: scripts/lib/date_utils.py
from scripts.lib.date_utils import get_today_for_db, get_days_ago_for_db

today = get_today_for_db()
seven_days_ago = get_days_ago_for_db(7)
```

### 仕組み

`@db.Date` カラムにJSTの日付を正しく保存するため、JST日付をそのまま UTC 00:00 の Date オブジェクトとして作成する。

```
JST 2/19 → new Date("2026-02-19T00:00:00Z") → PostgreSQL date型: 2026-02-19
```

### ✅ 良い例

```typescript
import { getTodayForDB, getDaysAgoForDB } from "@/lib/date-utils";

// DB保存
await prisma.dailyFeaturedStock.create({
  data: {
    date: getTodayForDB(),
    stockId: stock.id,
  },
});

// DB検索
const recommendations = await prisma.userDailyRecommendation.findMany({
  where: {
    date: getTodayForDB(),
  },
});

// 範囲検索
const recentData = await prisma.purchaseRecommendation.findFirst({
  where: {
    date: { gte: getDaysAgoForDB(7) },
  },
});
```

### ❌ 悪い例

```typescript
// JST→UTC変換してからtoDate() - date型で1日ズレる
const today = dayjs().tz("Asia/Tokyo").startOf("day").utc().toDate();

// UTC 00:00を使用 - JSTと9時間ずれる
const today = dayjs.utc().startOf("day").toDate();

// 生のDateを使用 - タイムゾーンが曖昧
const today = new Date();
today.setHours(0, 0, 0, 0);
```

### 対象テーブル

以下のテーブルは `@db.Date` 型で日付を保存しており、JST基準で統一：

- `SectorTrend.date` - セクタートレンド
- `DailyFeaturedStock.date` - 今日の注目銘柄
- `PurchaseRecommendation.date` - 購入判断
- `UserDailyRecommendation.date` - あなたへのおすすめ
- `DailyMarketMover.date` - 上昇/下落ランキング
- `DailyAIReport.date` - AI精度レポート
- `WeeklyAIReport.weekStart / weekEnd` - 週次レポート

### 注意事項

- **タイムスタンプ（createdAt, updatedAt等）**: `new Date()` でOK（現在時刻なのでTZ関係なし）
- **日付フィールド（@db.Date型）**: 必ず `getTodayForDB()` を使用
- **日付フォーマット表示**: `dayjs().tz("Asia/Tokyo").format("YYYY-MM-DD")`
- **スタンドアロンスクリプト**: `getTodayForDB` をインポートできない場合は `new Date(Date.UTC(year, month, date))` パターンを使用

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

**重要: LLMからの出力は必ず構造化し、型安全に扱ってください。**

## マジックナンバーを避ける

**コード内に直接数値を書かないでください。**

### 基本ルール

- 閾値、制限値、設定値は `lib/constants.ts` で定義する
- 定数には意味のある名前をつける
- コメントで何を意味する値か説明する

### ✅ 良い例

```typescript
import { PORTFOLIO_ANALYSIS } from "@/lib/constants";

if (daysSincePurchase <= PORTFOLIO_ANALYSIS.RECENT_PURCHASE_DAYS) {
  // ...
}
```

### ❌ 悪い例

```typescript
if (daysSincePurchase <= 3) {
  // ...
}
```

## 後方互換性

**URLやAPIの後方互換性は担保しません。**

### 方針

- 旧URLから新URLへのリダイレクトやreplaceは不要
- 古いURLを参照している通知等は、そのままエラーになってOK
- 新しい実装に合わせて、関連する全ての箇所を一括で更新する

### 例

```typescript
// ❌ 不要: 後方互換性のためのURL変換
url = url.replace(/^\/watchlist\//, "/my-stocks/");
url = url.replace(/^\/recommendations\//, "/stocks/");

// ✅ 正しい: 新しいURLをそのまま使用
const url = notification.url;
```

### 理由

- コードがシンプルになる
- 古い参照が残っていると気づきやすい（エラーになるため）
- 技術的負債を溜め込まない

## ループ処理の並列化

**ループ内の非同期処理は可能な限り並列化してください。**

### 基本ルール

1. **forループ内のawaitは並列化する**
2. **p-limit（TypeScript）やThreadPoolExecutor（Python）で同時実行数を制限する**
3. **API呼び出し（特にOpenAI）は同時実行数を制限してレート制限を回避する**

### TypeScript: p-limitを使用

```typescript
import pLimit from "p-limit";

// 同時実行数を制限（OpenAI APIなら5程度）
const limit = pLimit(5);

// ❌ 悪い例: 順次実行
for (const item of items) {
  await processItem(item);
}

// ✅ 良い例: 並列実行（同時実行数を制限）
const tasks = items.map((item) =>
  limit(async () => {
    await processItem(item);
  }),
);
await Promise.all(tasks);
```

### Python: ThreadPoolExecutorを使用

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

# 同時実行数を制限
AI_CONCURRENCY_LIMIT = 3

# ❌ 悪い例: 順次実行
for item in items:
    result = process_item(item)

# ✅ 良い例: 並列実行
with ThreadPoolExecutor(max_workers=AI_CONCURRENCY_LIMIT) as executor:
    futures = [executor.submit(process_item, item) for item in items]
    for future in as_completed(futures):
        result = future.result()
```

### 同時実行数の目安

| 処理タイプ            | 推奨同時実行数 | 理由                   |
| --------------------- | -------------- | ---------------------- |
| OpenAI API            | 3〜5           | レート制限を回避       |
| DB操作                | 10〜20         | コネクションプール考慮 |
| 外部API（yfinance等） | 5〜10          | サーバー負荷考慮       |
| プッシュ通知          | 10             | ネットワーク効率       |

### 定数定義

同時実行数は定数として定義してください：

```typescript
// AI API同時リクエスト数の制限
const AI_CONCURRENCY_LIMIT = 5;
```

### チェックリスト

コードレビュー時に確認：

- [ ] forループ内にawaitがないか
- [ ] 並列化可能な処理がPromise.allで実行されているか
- [ ] 同時実行数が適切に制限されているか

**重要: ループ内の非同期処理は、特別な理由がない限り並列化してください。**

### パイプライン化の検討

**ループ処理に複数の段階がある場合は、Producer-Consumerパターンでパイプライン化を検討してください。**

#### いつパイプライン化するか

以下の条件を満たす場合、パイプライン化が効果的：

1. **処理が2つ以上の段階に分かれる**（例: データ取得 → AI処理 → DB保存）
2. **各段階の実行速度が異なる**（例: API取得は遅いがDB保存は速い）
3. **前段階の全完了を待たずに次段階を開始できる**

#### パターン

```python
import queue
import threading
from concurrent.futures import ThreadPoolExecutor

SENTINEL = None  # Producer終了の合図

def producer(items: list, q: queue.Queue):
    """データ取得（順次）→ キューに投入"""
    for item in items:
        result = fetch_data(item)
        q.put(result)
        time.sleep(SLEEP_INTERVAL)
    q.put(SENTINEL)

def main():
    q: queue.Queue = queue.Queue(maxsize=CONCURRENCY * 2)

    # Producer: バックグラウンドでデータ取得
    thread = threading.Thread(target=producer, args=(items, q), daemon=True)
    thread.start()

    # Consumer: キューから取り出して並列処理
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = []
        while True:
            item = q.get()
            if item is SENTINEL:
                break
            futures.append(executor.submit(process_item, item))

        # 結果回収
        for future in futures:
            result = future.result()
```

#### 効果

- **直列**: 取得時間 + 処理時間（合計）
- **パイプライン**: max(取得時間, 処理時間)（重複実行）

#### チェックリスト

バッチ処理を実装する際：

- [ ] 処理が複数段階に分かれていないか
- [ ] 各段階を並行実行できないか
- [ ] `queue.Queue` + `ThreadPoolExecutor` でパイプライン化できないか

## 設計ファイルの扱い

実装された設計ファイルはコミット前に削除してください。
