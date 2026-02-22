# GitHub Actions

## ワークフローのジョブ設計

**複数のタスクを実行するワークフローは、ジョブ（jobs）を分割してください。**

### 理由

1. **再実行性**: 失敗したジョブから再実行できる（Re-run failed jobs）
2. **依存関係の明確化**: `needs` で実行順序を定義
3. **並列実行**: 独立したジョブは並列で実行される

### 基本パターン

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

### 条件付き実行

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

### チェックリスト

新しいワークフロー作成時：

- [ ] 1つのジョブに複数の独立したタスクを詰め込まない
- [ ] `needs` で依存関係を定義
- [ ] 通知ジョブは `if: always()` で常に実行
- [ ] 条件付き実行が必要な場合は出力変数を使用

## スクリプト言語の選択

**GitHub Actionsでスクリプトを作成する場合は必ずPythonを使用してください。**

### 理由

1. **エラーハンドリング**: try-exceptで詳細なエラー処理が可能
2. **ログ出力**: 進捗状況を詳細に表示できる
3. **保守性**: コードが読みやすく、修正しやすい
4. **YAML干渉回避**: heredoc構文によるYAMLパーサーエラーを防げる

### ✅ 良い例（Python）

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

### ❌ 悪い例（curl + heredoc）

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

### 既存のPythonスクリプト

プロジェクトには以下のPythonスクリプトがあります：

- `scripts/generate_daily_analysis.py` - 日次分析実行
- `scripts/generate_daily_report.py` - 週次レポート生成
- `scripts/generate_featured_stocks.py` - 今日の注目銘柄生成
- `scripts/fetch_stocks.py` - 株価データ取得
- `scripts/init_data.py` - 初期データ投入

## Slack通知

**GitHub Actionsワークフローには必ずSlack通知を追加してください。**

### 標準パターン

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

### ルール

1. **成功時**: `if: success()` で緑色（`good`）通知
2. **失敗時**: `if: failure()` で赤色（`danger`）通知
3. **アクション**: `rtCamp/action-slack-notify@v2` を使用
4. **Webhook**: `secrets.SLACK_WEBHOOK_URL` を使用
5. **フッター**: 必ず `"Stock Buddy"` を設定

### チェックリスト

新しいワークフロー作成時：

- [ ] 成功時のSlack通知を追加
- [ ] 失敗時のSlack通知を追加
- [ ] タイトルに処理内容を明記
- [ ] メッセージに適切な詳細を記載
